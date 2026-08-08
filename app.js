(() => {
  'use strict';

  const STORAGE_KEY = 'wiresketch-state-v1';
  const DEFAULT_BOARD_NAMES = ['ESP32 DevKit','OLED 0.96','USB-TTL'];
  const PCB_SCHEMA_ID = 'urn:wiresketch:schema:pcb:1.0';
  const ASSEMBLY_SCHEMA_ID = 'urn:wiresketch:schema:assembly:1.0';
  const PIN_COLORS = ['#f05e55', '#30343b', '#f2b642', '#4c8beb', '#40ae79', '#9b6bdf', '#eb7ab1', '#59adb4'];
  const INTERFACE_TYPE_DEFAULT_PINS = {
    uart: ['VCC', 'GND', 'RX', 'TX'],
    i2c: ['VCC', 'GND', 'SCL', 'SDA'],
    spi: ['VCC', 'GND', 'SCLK', 'MISO', 'MOSI', 'CSN'],
    power: ['V+', 'G'],
    usb: ['VCC', 'GND', 'DP', 'DN']
  };
  const DEFAULT_WIRE_STYLE = {width:2.2, gap:6, routeGap:6, cornerRadius:0, showFromLabels:true, showToLabels:true};
  const NODE = { width: 230, height: 215, imageX: 15, imageY: 10, imageWidth: 200, imageHeight: 170 };
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const uid = (prefix) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const escapeXml = (value = '') => String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&apos;','"':'&quot;'}[c]));
  const safeFileName = (value = '装配体') => String(value).replace(/[^\w\u4e00-\u9fa5-]+/g,'_');

  const placeholderSvg = (label = 'PCB', width = 420, height = 260, color = '#1d5b42') => {
    const safe = escapeHtml(label.slice(0, 14));
    const safeColor = /^#[0-9a-f]{6}$/i.test(color) ? color : '#1d5b42';
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 420 260" preserveAspectRatio="none"><defs><pattern id="p" width="36" height="36" patternUnits="userSpaceOnUse"><path d="M0 18h10m8 0h18M18 0v10m0 8v18" stroke="rgba(255,255,255,.28)" stroke-width="2"/><circle cx="18" cy="18" r="3" fill="#d8b960"/></pattern></defs><rect width="420" height="260" rx="16" fill="${safeColor}"/><rect x="12" y="12" width="396" height="236" rx="10" fill="url(#p)" stroke="#d0aa45" stroke-width="6"/><rect x="145" y="82" width="130" height="96" rx="5" fill="#26312e"/><g fill="#d9dfe0"><rect x="45" y="35" width="72" height="32"/><rect x="302" y="38" width="65" height="54"/><rect x="55" y="185" width="105" height="34"/></g><text x="210" y="137" text-anchor="middle" dominant-baseline="middle" font-family="sans-serif" font-size="22" font-weight="700" fill="#eef8f3">${safe}</text></svg>`)}`;
  };

  const demoBoards = () => [
    {
      kind: 'wiresketch/pcb', version: 1, id: uid('pcb'), name: 'ESP32 DevKit', image: placeholderSvg('ESP32 DevKit'), imageSize:{width:420,height:260}, builtIn:true, source:'generated', generated:{width:420,height:260,color:'#1d5b42'},
      interfaces: [
        {id: uid('if'), name:'POWER', type:'power', rect:{x:.02,y:.22,w:.12,h:.56}, pins:['5V','GND','3V3']},
        {id: uid('if'), name:'UART0', type:'uart', rect:{x:.86,y:.2,w:.12,h:.36}, pins:['TX0','RX0','GND']},
        {id: uid('if'), name:'I2C', type:'i2c', rect:{x:.86,y:.62,w:.12,h:.26}, pins:['SDA','SCL','3V3','GND']}
      ]
    },
    {
      kind: 'wiresketch/pcb', version: 1, id: uid('pcb'), name: 'OLED 0.96', image: placeholderSvg('OLED 0.96'), imageSize:{width:420,height:260}, builtIn:true, source:'generated', generated:{width:420,height:260,color:'#1d5b42'},
      interfaces: [{id: uid('if'), name:'I2C', type:'i2c', rect:{x:.02,y:.35,w:.16,h:.3}, pins:['GND','VCC','SCL','SDA']}]
    },
    {
      kind: 'wiresketch/pcb', version: 1, id: uid('pcb'), name: 'USB-TTL', image: placeholderSvg('USB-TTL'), imageSize:{width:420,height:260}, builtIn:true, source:'generated', generated:{width:420,height:260,color:'#1d5b42'},
      interfaces: [{id: uid('if'), name:'UART', type:'uart', rect:{x:.82,y:.25,w:.16,h:.5}, pins:['5V','GND','TXD','RXD']}]
    }
  ];

  let state = loadState();
  let selectedBoardId = state.boards[0]?.id || null;
  let selectedInterfaceId = null;
  let selectedNodeId = null;
  let selectedWireId = null;
  let selectedWirePinKey = null;
  let selectedPort = null;
  let pendingPort = null;
  let zoom = 1;
  let boardZoom = null;
  let boardRenderedScale = 1;
  let drawStart = null;
  let interfaceDragState = null;
  let dragState = null;
  let nameDragState = null;
  let ignoreCanvasClickUntil = 0;
  let transparentColorPicking = false;
  let imageRotationPreview = 0;
  let imageRotationBusy = false;
  const transparentImageCache = new Map();
  const transparentImageJobs = new Map();

  function transparencyKey(board) {
    const config=board?.backgroundTransparency;
    return config&&/^#[0-9a-f]{6}$/i.test(config.color||'')?`${config.color.toLowerCase()}|${Number(config.tolerance)||0}`:null;
  }

  function boardImageSource(board) {
    const key=transparencyKey(board),cached=key&&transparentImageCache.get(board.id);
    return cached?.key===key&&cached.source===board.image?cached.dataUrl:board?.image;
  }

  function loadImageSource(source) {
    return new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=reject;image.src=source;});
  }

  async function ensureTransparentBoardImage(board) {
    const key=transparencyKey(board);
    if(!key||!board?.image)return board?.image;
    const source=board.image,cached=transparentImageCache.get(board.id);if(cached?.key===key&&cached.source===source)return cached.dataUrl;
    if(transparentImageJobs.get(board.id)?.key===key&&transparentImageJobs.get(board.id)?.source===source)return transparentImageJobs.get(board.id).promise;
    const promise=(async()=>{
      const image=await loadImageSource(board.image);
      const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
      const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(image,0,0);
      const pixels=context.getImageData(0,0,canvas.width,canvas.height),data=pixels.data;
      const color=board.backgroundTransparency.color,red=parseInt(color.slice(1,3),16),green=parseInt(color.slice(3,5),16),blue=parseInt(color.slice(5,7),16);
      const tolerance=Math.max(0,Math.min(64,Number(board.backgroundTransparency.tolerance)||0));
      for(let index=0;index<data.length;index+=4){if(Math.max(Math.abs(data[index]-red),Math.abs(data[index+1]-green),Math.abs(data[index+2]-blue))<=tolerance)data[index+3]=0;}
      context.putImageData(pixels,0,0);
      const dataUrl=canvas.toDataURL('image/png');
      if(transparencyKey(board)===key&&board.image===source)transparentImageCache.set(board.id,{key,source,dataUrl});
      return dataUrl;
    })().finally(()=>{const job=transparentImageJobs.get(board.id);if(job?.key===key&&job?.source===source)transparentImageJobs.delete(board.id);});
    transparentImageJobs.set(board.id,{key,source,promise});
    return promise;
  }

  function loadState() {
    try {
      if(typeof localStorage==='undefined')throw new Error('No browser storage');
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (saved?.boards && saved?.assembly) {
        saved.boards.forEach(board => {
          if (board.builtIn == null) board.builtIn = DEFAULT_BOARD_NAMES.includes(board.name);
          if (!board.image) {
            board.source='generated';
            board.generated={width:420,height:260,color:'#1d5b42'};
          } else if (board.builtIn && board.image.startsWith('data:image/svg+xml') && !board.source) {
            board.source='generated';
            board.generated={width:board.imageSize?.width||420,height:board.imageSize?.height||260,color:'#1d5b42'};
          }
          if (board.source==='generated') refreshGeneratedBoard(board);
        });
        return saved;
      }
    } catch (_) {}
    return { boards: demoBoards(), assembly: {kind:'wiresketch/assembly', version:1, id:uid('assembly'), name:'新建连接图', nodes:[], connections:[]} };
  }

  function refreshGeneratedBoard(board) {
    const config=board.generated||(board.generated={width:420,height:260,color:'#1d5b42'});
    config.width=Math.max(120,Math.min(2400,+config.width||420));
    config.height=Math.max(80,Math.min(1600,+config.height||260));
    if(!/^#[0-9a-f]{6}$/i.test(config.color||''))config.color='#1d5b42';
    board.imageSize={width:config.width,height:config.height};
    board.image=placeholderSvg(board.name,config.width,config.height,config.color);
  }

  function redrawGeneratedBoard(board, fit=false) {
    refreshGeneratedBoard(board);
    if(board.id===selectedBoardId){
      if(fit)boardZoom=null;
      const image=$('#boardImage');
      image.onload=()=>requestAnimationFrame(syncOverlay);
      image.src=board.image;
    }
    saveState();renderBoardList();renderComponentList();
  }

  function applyVirtualBoardSettings() {
    const board=currentBoard();if(board?.source!=='generated')return;
    board.generated.width=+$('#virtualBoardWidth').value||420;
    board.generated.height=+$('#virtualBoardHeight').value||260;
    board.generated.color=$('#virtualBoardColor').value;
    redrawGeneratedBoard(board,true);renderBoardEditor();
  }

  let saveTimer;
  function saveState() {
    $('.save-status').innerHTML = '<i></i> 保存中…';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      $('.save-status').innerHTML = '<i></i> 已自动保存';
    }, 180);
  }

  function currentBoard() { return state.boards.find(b => b.id === selectedBoardId); }
  function currentInterface() { return currentBoard()?.interfaces.find(i => i.id === selectedInterfaceId); }
  function interfaceRotation(intf) {
    const rotation = Number(intf?.rotation);
    return [0, 90, 180, 270].includes(rotation) ? rotation : 0;
  }
  function pinOneSide(intf) {
    return ({0:'left', 90:'top', 180:'right', 270:'bottom'})[interfaceRotation(intf)];
  }
  function nodeRotation(node) {
    const rotation=Number(node?.rotation);
    return [0,90,180,270].includes(rotation)?rotation:0;
  }
  function nodeFlipX(node) { return node?.flipX===true; }
  function nodeFixed(node) { return node?.fixed===true; }
  function nodeNameVisible(node) { return node?.showName!==false; }
  function nodeNameOffset(board,node) {
    const configured=node?.nameOffset;
    if(configured&&Number.isFinite(Number(configured.x))&&Number.isFinite(Number(configured.y)))return {x:Number(configured.x),y:Number(configured.y)};
    const bounds=getBoardImageGeometry(board,node).bounds;
    return {x:0,y:bounds.height/2+18};
  }
  function interfaceSingleSignalMode(node,interfaceId) { return node?.interfaceConnectionModes?.[interfaceId]==='signal'; }
  function connectionMode(connection) { return connection?.mode==='signal'?'signal':'bundle'; }
  function nodeScale(node) {
    const scale=Number(node?.scale);
    return Number.isFinite(scale)?Math.max(.5,Math.min(2,scale)):1;
  }
  function assemblyWireDefaults() {
    const configured=state.assembly.wireDefaults||{};
    const labelGap=Number(configured.labelGap??configured.gap);
    const routeGap=Number(configured.routeGap);
    const cornerRadius=Number(configured.cornerRadius);
    return {
      width:Math.max(1,Math.min(8,Number(configured.width)||DEFAULT_WIRE_STYLE.width)),
      gap:Number.isFinite(labelGap)?Math.max(0,Math.min(24,labelGap)):DEFAULT_WIRE_STYLE.gap,
      routeGap:Number.isFinite(routeGap)?Math.max(0,Math.min(20,routeGap)):DEFAULT_WIRE_STYLE.routeGap,
      cornerRadius:Number.isFinite(cornerRadius)?Math.max(0,Math.min(24,cornerRadius)):DEFAULT_WIRE_STYLE.cornerRadius,
      showFromLabels:configured.showFromLabels!==false,
      showToLabels:configured.showToLabels!==false
    };
  }
  function updateAssemblyWireDefaults(changes) {
    const defaults=assemblyWireDefaults();
    state.assembly.wireDefaults={width:defaults.width,labelGap:defaults.gap,routeGap:defaults.routeGap,cornerRadius:defaults.cornerRadius,showFromLabels:defaults.showFromLabels,showToLabels:defaults.showToLabels,...changes};
  }
  function signalWireStyle(signal) {
    const defaults=assemblyWireDefaults(),configured=signal?.style||{};
    return {
      width:Math.max(1,Math.min(8,Number(configured.width)||defaults.width)),
      gap:defaults.gap,
      cornerRadius:typeof configured.cornerRadius==='number'?Math.max(0,Math.min(24,configured.cornerRadius)):defaults.cornerRadius,
      showFromLabels:typeof configured.showFromLabels==='boolean'?configured.showFromLabels:defaults.showFromLabels,
      showToLabels:typeof configured.showToLabels==='boolean'?configured.showToLabels:defaults.showToLabels
    };
  }
  function connectionWireGap(connection) {
    const configured=Number(connection?.gap);
    return Number.isFinite(configured)&&configured>=0&&configured<=20?configured:assemblyWireDefaults().routeGap;
  }
  function interfaceLabelGap(node,interfaceId) {
    const configured=Number(node?.interfaceLabelGaps?.[interfaceId]??node?.interfaceSignalGaps?.[interfaceId]);
    return Number.isFinite(configured)&&configured>=0&&configured<=24?configured:assemblyWireDefaults().gap;
  }
  function assemblyCanvasSize() {
    const configured=state.assembly.canvasSize||{};
    return {width:Math.max(600,Math.min(3000,Number(configured.width)||1200)),height:Math.max(400,Math.min(2000,Number(configured.height)||800))};
  }

  function switchView(view) {
    $$('.mode-btn').forEach(b => b.classList.toggle('active', b.dataset.view === view));
    $$('.workspace').forEach(v => v.classList.remove('active'));
    $(`#${view}View`).classList.add('active');
    if (view === 'assembly') { renderComponentList(); renderAssembly(); }
  }

  function renderBoardList() {
    const query = $('#boardSearch').value.trim().toLowerCase();
    const list = state.boards.filter(b => b.name.toLowerCase().includes(query));
    $('#boardList').innerHTML = list.map(b => `<div class="board-row"><button class="board-item ${b.id === selectedBoardId ? 'active' : ''}" data-id="${b.id}"><img class="board-thumb" src="${boardImageSource(b) || placeholderSvg(b.name)}" alt=""><span><strong>${escapeHtml(b.name)}</strong><small>${b.interfaces.length} 个接口${b.builtIn?' · 默认':''}</small></span></button><button class="board-delete ${b.builtIn?'locked':''}" data-delete-id="${b.id}" ${b.builtIn?'disabled title="默认板卡不能删除"':'title="删除板卡"'}>${b.builtIn?'▣':'×'}</button></div>`).join('') || '<div class="property-empty"><p>没有匹配的板卡</p></div>';
    $$('.board-item').forEach(el => el.onclick = () => selectBoard(el.dataset.id));
    $$('.board-delete:not(:disabled)').forEach(el => el.onclick = () => deleteBoard(el.dataset.deleteId));
  }

  function selectBoard(id) {
    selectedBoardId = id;
    selectedInterfaceId = null;
    boardZoom = null;
    renderBoardList();
    renderBoardEditor();
  }

  function renderBoardEditor() {
    const board = currentBoard();
    if (!board) return;
    if(!imageRotationBusy)syncImageRotationControls(board);
    $('#boardName').value = board.name;
    $('#boardBreadcrumb').textContent = board.name;
    const generated=board.source==='generated';
    $('#virtualBoardControls').classList.toggle('hidden',!generated);
    $('#imageTransparencyControls').classList.toggle('hidden',generated||!board.image);
    if(generated||!board.image)setTransparentColorPicking(false);
    renderTransparencyControls(board);
    if(generated){
      $('#virtualBoardWidth').value=board.generated.width;
      $('#virtualBoardHeight').value=board.generated.height;
      $('#virtualBoardColor').value=board.generated.color;
    }
    const img = $('#boardImage');
    if (board.image) {
      img.src = boardImageSource(board);
      img.style.display = 'block';
      $('#imageWorkspace').classList.remove('hidden');
      $('#emptyImage').classList.add('hidden');
      const ready = () => {
        if (!board.imageSize && img.naturalWidth) {
          board.imageSize = {width:img.naturalWidth, height:img.naturalHeight};
          saveState();
        }
        requestAnimationFrame(syncOverlay);
      };
      img.complete ? ready() : img.onload = ready;
      if(board.backgroundTransparency&&boardImageSource(board)===board.image)ensureTransparentBoardImage(board).then(()=>{if(currentBoard()===board){img.onload=ready;img.src=boardImageSource(board);}renderBoardList();renderComponentList();if($('#assemblyView').classList.contains('active'))renderAssembly();}).catch(()=>toast('图片透明背景处理失败'));
    } else {
      img.style.display = 'none';
      $('#imageWorkspace').classList.add('hidden');
      $('#emptyImage').classList.remove('hidden');
      $('#interfaceOverlay').innerHTML = '';
    }
    renderInterfaceForm();
  }

  function setTransparentColorPicking(active) {
    transparentColorPicking=!!active;
    $('#imageStage').classList.toggle('color-picking',transparentColorPicking);
    $('#pickTransparentColorBtn').classList.toggle('active',transparentColorPicking);
    $('#pickTransparentColorBtn').textContent=transparentColorPicking?'请点击图片取色':'吸取透明色';
  }

  function renderTransparencyControls(board=currentBoard()) {
    const config=board?.source==='image'?board.backgroundTransparency:null,status=$('#transparentColorStatus');
    status.querySelector('span').textContent=config?.color?.toUpperCase()||'尚未设置';
    status.querySelector('i').style.background=config?.color||'';
    $('#clearTransparentColorBtn').classList.toggle('hidden',!config);
  }

  async function pickTransparentColor(e) {
    const board=currentBoard(),overlay=$('#interfaceOverlay'),rect=overlay.getBoundingClientRect();
    if(e.button!==0||!board?.image||board.source!=='image'||e.clientX<rect.left||e.clientX>rect.right||e.clientY<rect.top||e.clientY>rect.bottom)return;
    setTransparentColorPicking(false);
    try {
      const image=await loadImageSource(board.image),canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
      const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(image,0,0);
      const x=Math.min(canvas.width-1,Math.max(0,Math.floor((e.clientX-rect.left)/rect.width*canvas.width)));
      const y=Math.min(canvas.height-1,Math.max(0,Math.floor((e.clientY-rect.top)/rect.height*canvas.height)));
      const [red,green,blue]=context.getImageData(x,y,1,1).data;
      board.backgroundTransparency={color:`#${[red,green,blue].map(value=>value.toString(16).padStart(2,'0')).join('')}`,tolerance:12};
      transparentImageCache.delete(board.id);saveState();renderTransparencyControls(board);
      await ensureTransparentBoardImage(board);
      renderBoardEditor();renderBoardList();renderComponentList();if($('#assemblyView').classList.contains('active'))renderAssembly();
      toast(`已将 ${board.backgroundTransparency.color.toUpperCase()} 设为透明`);
    } catch(error) {console.error(error);toast('取色失败，请检查图片格式');}
  }

  function clearTransparentColor() {
    const board=currentBoard();if(!board)return;
    delete board.backgroundTransparency;transparentImageCache.delete(board.id);setTransparentColorPicking(false);saveState();
    renderBoardEditor();renderBoardList();renderComponentList();if($('#assemblyView').classList.contains('active'))renderAssembly();toast('已恢复图片背景');
  }

  function rotatedCanvasSize(width,height,radians) {
    const cosine=Math.abs(Math.cos(radians)),sine=Math.abs(Math.sin(radians));
    return {width:Math.max(1,Math.ceil(width*cosine+height*sine)),height:Math.max(1,Math.ceil(width*sine+height*cosine))};
  }

  function normalizedImageRotation(value) {
    const angle=Math.max(-180,Math.min(180,Number(value)||0));
    return Math.round(angle*10)/10;
  }

  function rotationDelta(from,to) {
    let delta=to-from;
    while(delta>180)delta-=360;
    while(delta<-180)delta+=360;
    return delta;
  }

  function previewImportedImageRotation(targetDegrees) {
    const current=normalizedImageRotation(currentBoard()?.imageRotation),target=normalizedImageRotation(targetDegrees);
    imageRotationPreview=rotationDelta(current,target);
    const transform=imageRotationPreview?`rotate(${imageRotationPreview}deg)`:'';
    $('#boardImage').style.transform=transform;$('#interfaceOverlay').style.transform=transform;
    $('#boardImage').style.transformOrigin='center';$('#interfaceOverlay').style.transformOrigin='center';
    $('#imageStage').classList.toggle('image-rotation-preview',!!imageRotationPreview);
  }

  function syncImageRotationControls(board=currentBoard()) {
    const angle=board?.source==='image'?normalizedImageRotation(board.imageRotation):0;
    imageRotationPreview=0;$('#imageRotationAngle').value=angle;$('#imageRotationSlider').value=angle;
    $('#imageRotationSlider').disabled=false;$('#imageRotationAngle').disabled=false;
    $('#boardImage').style.transform='';$('#interfaceOverlay').style.transform='';$('#imageStage').classList.remove('image-rotation-preview');
  }

  function rotateInterfaceRects(board,oldWidth,oldHeight,newWidth,newHeight,radians,rotatedCenterX=newWidth/2,rotatedCenterY=newHeight/2) {
    const cosine=Math.cos(radians),sine=Math.sin(radians),oldCenter={x:oldWidth/2,y:oldHeight/2},newCenter={x:rotatedCenterX,y:rotatedCenterY};
    const rotate=(x,y)=>{const dx=x-oldCenter.x,dy=y-oldCenter.y;return {x:newCenter.x+dx*cosine-dy*sine,y:newCenter.y+dx*sine+dy*cosine};};
    board.interfaces.forEach(intf=>{
      const left=intf.rect.x*oldWidth,top=intf.rect.y*oldHeight,right=(intf.rect.x+intf.rect.w)*oldWidth,bottom=(intf.rect.y+intf.rect.h)*oldHeight;
      const points=[rotate(left,top),rotate(right,top),rotate(right,bottom),rotate(left,bottom)],xs=points.map(point=>point.x),ys=points.map(point=>point.y);
      const minX=Math.max(0,Math.min(...xs)),minY=Math.max(0,Math.min(...ys)),maxX=Math.min(newWidth,Math.max(...xs)),maxY=Math.min(newHeight,Math.max(...ys));
      intf.rect={x:minX/newWidth,y:minY/newHeight,w:(maxX-minX)/newWidth,h:(maxY-minY)/newHeight};
      const quarterTurns=Math.round((radians*180/Math.PI)/90);
      if(Math.abs(radians*180/Math.PI-quarterTurns*90)<.001)intf.rotation=(interfaceRotation(intf)+quarterTurns*90+360)%360;
    });
  }

  function trimTransparentCanvas(canvas) {
    const context=canvas.getContext('2d',{willReadFrequently:true}),data=context.getImageData(0,0,canvas.width,canvas.height).data;
    let left=canvas.width,top=canvas.height,right=-1,bottom=-1;
    for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++){if(data[(y*canvas.width+x)*4+3]){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);}}
    if(right<left)return {canvas,left:0,top:0};
    const width=right-left+1,height=bottom-top+1;if(!left&&!top&&width===canvas.width&&height===canvas.height)return {canvas,left:0,top:0};
    const trimmed=document.createElement('canvas');trimmed.width=width;trimmed.height=height;trimmed.getContext('2d').drawImage(canvas,left,top,width,height,0,0,width,height);
    return {canvas:trimmed,left,top};
  }

  async function rotateImportedImage(requestedDegrees) {
    const board=currentBoard(),target=normalizedImageRotation(requestedDegrees??$('#imageRotationAngle').value),current=normalizedImageRotation(board?.imageRotation),degrees=rotationDelta(current,target);
    if(imageRotationBusy||!board?.image||board.source!=='image')return;if(!degrees){syncImageRotationControls(board);return;}
    imageRotationBusy=true;$('#imageRotationSlider').disabled=true;$('#imageRotationAngle').disabled=true;setTransparentColorPicking(false);
    $('#boardImage').style.transform='';$('#interfaceOverlay').style.transform='';$('#imageStage').classList.remove('image-rotation-preview');imageRotationPreview=0;
    try {
      const image=await loadImageSource(board.image),radians=degrees*Math.PI/180,size=rotatedCanvasSize(image.naturalWidth,image.naturalHeight,radians);
      if(size.width>12000||size.height>12000||size.width*size.height>64000000)throw new RangeError('旋转后的图片尺寸过大');
      const canvas=document.createElement('canvas');canvas.width=size.width;canvas.height=size.height;
      const context=canvas.getContext('2d');context.imageSmoothingEnabled=true;context.imageSmoothingQuality='high';context.translate(size.width/2,size.height/2);context.rotate(radians);context.drawImage(image,-image.naturalWidth/2,-image.naturalHeight/2);
      const trimmed=trimTransparentCanvas(canvas),output=trimmed.canvas;
      rotateInterfaceRects(board,image.naturalWidth,image.naturalHeight,output.width,output.height,radians,size.width/2-trimmed.left,size.height/2-trimmed.top);
      board.image=output.toDataURL('image/png');board.imageSize={width:output.width,height:output.height};board.imageRotation=target;transparentImageCache.delete(board.id);boardZoom=null;
      await ensureTransparentBoardImage(board);saveState();renderBoardEditor();renderBoardList();renderComponentList();if($('#assemblyView').classList.contains('active'))renderAssembly();
      toast(`图片角度 ${target}°`);
    } catch(error) {console.error(error);toast(error instanceof RangeError?error.message:'图片旋转失败，请检查图片格式');}
    finally {imageRotationBusy=false;syncImageRotationControls(board);}
  }

  function syncOverlay() {
    const img = $('#boardImage');
    const stage = $('#imageStage');
    const overlay = $('#interfaceOverlay');
    if (img.style.display === 'none') return;
    const board = currentBoard();
    const naturalWidth = board?.imageSize?.width || img.naturalWidth;
    const naturalHeight = board?.imageSize?.height || img.naturalHeight;
    if (!naturalWidth || !naturalHeight) return;
    const maxWidth = Math.max(1, stage.clientWidth - 50);
    const maxHeight = Math.max(1, stage.clientHeight - 40);
    const fitScale = Math.min(maxWidth / naturalWidth, maxHeight / naturalHeight, 1);
    const scale = Math.max(.02, Math.min(4, boardZoom ?? fitScale));
    boardRenderedScale = scale;
    const workspace = $('#imageWorkspace');
    const imageWidth = naturalWidth * scale, imageHeight = naturalHeight * scale;
    const workspaceWidth = Math.max(stage.clientWidth, imageWidth + 50);
    const workspaceHeight = Math.max(stage.clientHeight, imageHeight + 40);
    workspace.style.width = `${workspaceWidth}px`;
    workspace.style.height = `${workspaceHeight}px`;
    img.style.width = `${naturalWidth * scale}px`;
    img.style.height = `${naturalHeight * scale}px`;
    const left = (workspaceWidth-imageWidth)/2, top = (workspaceHeight-imageHeight)/2;
    img.style.left = `${left}px`; img.style.top = `${top}px`;
    Object.assign(overlay.style, {left:`${left}px`, top:`${top}px`, width:`${imageWidth}px`, height:`${imageHeight}px`});
    $('#boardZoomLabel').textContent = `${Math.round(scale*100)}%`;
    renderInterfaces();
  }

  function changeBoardZoom(factor) {
    if (!currentBoard()?.image) return;
    const stage=$('#imageStage');
    const oldWidth=stage.scrollWidth, oldHeight=stage.scrollHeight;
    const centerX=(stage.scrollLeft+stage.clientWidth/2)/oldWidth;
    const centerY=(stage.scrollTop+stage.clientHeight/2)/oldHeight;
    boardZoom=Math.max(.02,Math.min(4,boardRenderedScale*factor));
    syncOverlay();
    stage.scrollLeft=centerX*stage.scrollWidth-stage.clientWidth/2;
    stage.scrollTop=centerY*stage.scrollHeight-stage.clientHeight/2;
  }

  function fitBoardImage() {
    boardZoom=null;
    syncOverlay();
    $('#imageStage').scrollTo({left:0,top:0});
  }

  function renderInterfaces() {
    const overlay = $('#interfaceOverlay');
    const board = currentBoard();
    if (!board) return;
    overlay.innerHTML = board.interfaces.map(i => {
      const side=pinOneSide(i),rotation=interfaceRotation(i);
      return `<button class="interface-box pin1-${side} ${i.id === selectedInterfaceId ? 'selected' : ''}" data-id="${i.id}" data-label="${escapeHtml(i.name)} · ${i.pins.length}P · ${rotation}°" style="left:${i.rect.x*100}%;top:${i.rect.y*100}%;width:${i.rect.w*100}%;height:${i.rect.h*100}%"><span class="pin-one-marker pin-one-${side}" title="Pin 1">P1</span></button>`;
    }).join('');
    $$('.interface-box', overlay).forEach(el => el.onpointerdown = onInterfacePointerDown);
  }

  function onInterfacePointerDown(e) {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const intf=currentBoard()?.interfaces.find(i=>i.id===e.currentTarget.dataset.id);
    const overlay=$('#interfaceOverlay'),r=overlay.getBoundingClientRect();
    if(!intf||!r.width||!r.height)return;
    selectedInterfaceId=intf.id;
    interfaceDragState={id:intf.id,startClientX:e.clientX,startClientY:e.clientY,startX:intf.rect.x,startY:intf.rect.y,overlayWidth:r.width,overlayHeight:r.height};
    $$('.interface-box',overlay).forEach(box=>box.classList.toggle('selected',box.dataset.id===intf.id));
    renderInterfaceForm();
    $('#imageStage').setPointerCapture(e.pointerId);
  }

  function moveInterface(e) {
    if(!interfaceDragState)return false;
    const intf=currentBoard()?.interfaces.find(i=>i.id===interfaceDragState.id);
    if(!intf)return false;
    intf.rect.x=Math.max(0,Math.min(1-intf.rect.w,interfaceDragState.startX+(e.clientX-interfaceDragState.startClientX)/interfaceDragState.overlayWidth));
    intf.rect.y=Math.max(0,Math.min(1-intf.rect.h,interfaceDragState.startY+(e.clientY-interfaceDragState.startClientY)/interfaceDragState.overlayHeight));
    const el=$$('.interface-box').find(box=>box.dataset.id===intf.id);
    if(el){el.style.left=`${intf.rect.x*100}%`;el.style.top=`${intf.rect.y*100}%`;}
    return true;
  }

  function endInterfaceDrag() {
    if(!interfaceDragState)return false;
    interfaceDragState=null;
    saveState();
    renderInterfaces();
    return true;
  }

  function renderInterfaceForm() {
    const intf = currentInterface();
    $('#interfaceEmpty').classList.toggle('hidden', !!intf);
    $('#interfaceForm').classList.toggle('hidden', !intf);
    if (!intf) return;
    $('#interfaceName').value = intf.name;
    $('#interfaceType').value = intf.type || 'generic';
    $('#pinCount').value = intf.pins.length;
    $('#interfaceRotation').value = interfaceRotation(intf);
    renderPins(intf);
  }

  function renderPins(intf) {
    $('#pinList').innerHTML = intf.pins.map((pin, idx) => `<label class="pin-row"><span>P${idx+1}</span><input value="${escapeHtml(pin)}" data-index="${idx}" placeholder="信号名称"><i class="pin-color" style="background:${PIN_COLORS[idx % PIN_COLORS.length]}"></i></label>`).join('');
    $$('#pinList input').forEach(input => input.oninput = () => { intf.pins[+input.dataset.index] = input.value; saveState(); });
  }

  function applyInterfaceTypeDefaults(intf, type) {
    intf.type = type;
    const defaultPins = INTERFACE_TYPE_DEFAULT_PINS[type];
    if (defaultPins) intf.pins = [...defaultPins];
  }

  function newBoard() {
    const board = {kind:'wiresketch/pcb', version:1, id:uid('pcb'), name:'未命名板卡', image:null, imageSize:{width:420,height:260}, source:'generated', generated:{width:420,height:260,color:'#1d5b42'}, builtIn:false, interfaces:[]};
    refreshGeneratedBoard(board);
    state.boards.unshift(board); selectedBoardId = board.id; selectedInterfaceId = null; boardZoom=null; saveState(); renderBoardList(); renderBoardEditor();
  }

  function deleteBoard(id) {
    const board=state.boards.find(b=>b.id===id); if(!board||board.builtIn)return;
    const nodeIds=state.assembly.nodes.filter(n=>n.boardId===id).map(n=>n.id);
    const message=nodeIds.length?`“${board.name}”已在装配体中使用 ${nodeIds.length} 次。删除板卡会同时移除这些节点和相关连接，确定继续吗？`:`确定删除板卡“${board.name}”吗？`;
    if(!confirm(message))return;
    const removed=new Set(nodeIds);
    state.boards=state.boards.filter(b=>b.id!==id);
    state.assembly.nodes=state.assembly.nodes.filter(n=>!removed.has(n.id));
    state.assembly.connections=state.assembly.connections.filter(c=>!removed.has(c.from.nodeId)&&!removed.has(c.to.nodeId));
    if(selectedBoardId===id){selectedBoardId=state.boards[0]?.id||null;selectedInterfaceId=null;boardZoom=null;}
    saveState();renderBoardList();renderBoardEditor();renderComponentList();
  }

  function handleImage(file) {
    if (!file?.type.startsWith('image/')) return toast('请选择图片文件');
    syncImageRotationControls();
    const targetBoard=currentBoard();
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      const probe = new Image();
      probe.onload = () => {
        if(!state.boards.includes(targetBoard))return;
        targetBoard.image = dataUrl;
        targetBoard.imageSize = {width:probe.naturalWidth, height:probe.naturalHeight};
        targetBoard.source='image';
        delete targetBoard.imageRotation;
        delete targetBoard.backgroundTransparency;
        transparentImageCache.delete(targetBoard.id);
        delete targetBoard.generated;
        if(targetBoard.id===selectedBoardId)boardZoom=null;
        saveState(); renderBoardEditor(); renderBoardList();
      };
      probe.src = dataUrl;
    };
    reader.readAsDataURL(file);
  }

  function onStagePointerDown(e) {
    if(imageRotationPreview)return;
    if(transparentColorPicking){e.preventDefault();pickTransparentColor(e);return;}
    if (e.button !== 0 || !currentBoard()?.image || e.target.closest('.interface-box')) return;
    const overlay = $('#interfaceOverlay'), r = overlay.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return;
    drawStart = {x: Math.max(0, Math.min(1, (e.clientX-r.left)/r.width)), y: Math.max(0, Math.min(1, (e.clientY-r.top)/r.height))};
    const box = document.createElement('div'); box.className = 'drawing-box'; box.id = 'drawingBox'; overlay.appendChild(box);
    $('#imageStage').setPointerCapture(e.pointerId);
  }

  function onStagePointerMove(e) {
    if (moveInterface(e)) return;
    if (!drawStart) return;
    const overlay = $('#interfaceOverlay'), r = overlay.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX-r.left)/r.width)), y = Math.max(0, Math.min(1, (e.clientY-r.top)/r.height));
    const left = Math.min(x, drawStart.x), top = Math.min(y, drawStart.y);
    Object.assign($('#drawingBox').style, {left:`${left*100}%`, top:`${top*100}%`, width:`${Math.abs(x-drawStart.x)*100}%`, height:`${Math.abs(y-drawStart.y)*100}%`});
  }

  function onStagePointerUp(e) {
    if (endInterfaceDrag()) return;
    if (!drawStart) return;
    const overlay = $('#interfaceOverlay'), r = overlay.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX-r.left)/r.width)), y = Math.max(0, Math.min(1, (e.clientY-r.top)/r.height));
    const rect = {x:Math.min(x,drawStart.x), y:Math.min(y,drawStart.y), w:Math.abs(x-drawStart.x), h:Math.abs(y-drawStart.y)};
    drawStart = null;
    if (rect.w > .015 && rect.h > .015) {
      const intf = {id:uid('if'), name:`J${currentBoard().interfaces.length+1}`, type:'generic', rect, rotation:0, pins:['Pin 1','Pin 2','Pin 3','Pin 4']};
      currentBoard().interfaces.push(intf); selectedInterfaceId = intf.id; saveState(); renderBoardList(); renderInterfaces(); renderInterfaceForm(); $('#interfaceName').select();
    } else renderInterfaces();
  }

  function deleteSelectedInterface() {
    if (!selectedInterfaceId) return;
    const board = currentBoard();
    const removedId = selectedInterfaceId;
    board.interfaces = board.interfaces.filter(i => i.id !== removedId); selectedInterfaceId = null;
    state.assembly.connections = state.assembly.connections.filter(c => c.from.interfaceId !== removedId && c.to.interfaceId !== removedId);
    saveState(); renderBoardList(); renderInterfaces(); renderInterfaceForm();
  }

  function downloadJson(data, name) {
    const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
    downloadBlob(blob, `${safeFileName(name)}.json`);
  }

  function downloadBlob(blob, fileName) {
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = fileName; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function toPcbDocument(board) {
    return {
      schema:PCB_SCHEMA_ID,
      schemaVersion:'1.1.0',
      kind:'wiresketch/pcb',
      version:1,
      id:board.id,
      name:board.name||'未命名板卡',
      description:board.description||'',
      coordinateSystem:{origin:'top-left',axisX:'right',axisY:'down',regionUnit:'normalized'},
      image:board.image||null,
      imageSize:{width:board.imageSize?.width||420,height:board.imageSize?.height||260,unit:'px'},
      source:board.source||'image',
      ...(board.source==='image'&&normalizedImageRotation(board.imageRotation)?{imageRotation:normalizedImageRotation(board.imageRotation)}:{}),
      ...(board.source==='image'&&board.backgroundTransparency?{backgroundTransparency:structuredClone(board.backgroundTransparency)}:{}),
      ...(board.source==='generated'?{generated:structuredClone(board.generated)}:{}),
      interfaces:board.interfaces.map((intf,index)=>({
        id:intf.id,
        name:intf.name||`J${index+1}`,
        type:intf.type||'generic',
        description:intf.description||'',
        rect:{x:intf.rect.x,y:intf.rect.y,w:intf.rect.w,h:intf.rect.h},
        rotation:interfaceRotation(intf),
        pins:intf.pins.map((pin,pinIndex)=>String(pin).trim()||`Pin ${pinIndex+1}`)
      }))
    };
  }

  function toAssemblyDocument() {
    const boards=[...new Set(state.assembly.nodes.map(n=>n.boardId))].map(id=>state.boards.find(b=>b.id===id)).filter(Boolean);
    const wireDefaults=assemblyWireDefaults();
    return {
      schema:ASSEMBLY_SCHEMA_ID,
      schemaVersion:'1.4.0',
      kind:'wiresketch/assembly',
      version:1,
      id:state.assembly.id,
      name:state.assembly.name,
      description:state.assembly.description||'',
      layout:{origin:'top-left',axisX:'right',axisY:'down',unit:'diagram-px',routing:'hybrid'},
      canvasSize:assemblyCanvasSize(),
      wireDefaults:{width:wireDefaults.width,labelGap:wireDefaults.gap,routeGap:wireDefaults.routeGap,cornerRadius:wireDefaults.cornerRadius,showFromLabels:wireDefaults.showFromLabels,showToLabels:wireDefaults.showToLabels},
      nodes:state.assembly.nodes.map(node=>{const labelGaps=node.interfaceLabelGaps||node.interfaceSignalGaps,modes=node.interfaceConnectionModes;return {id:node.id,boardId:node.boardId,label:node.label,x:node.x,y:node.y,rotation:nodeRotation(node),flipX:nodeFlipX(node),scale:nodeScale(node),fixed:nodeFixed(node),showName:nodeNameVisible(node),...(node.nameOffset?{nameOffset:{x:Number(node.nameOffset.x)||0,y:Number(node.nameOffset.y)||0}}:{}),...(labelGaps?{interfaceLabelGaps:{...labelGaps}}:{}),...(modes&&Object.keys(modes).length?{interfaceConnectionModes:{...modes}}:{})};}),
      connections:state.assembly.connections.map(connection=>({
        id:connection.id,
        mode:connectionMode(connection),
        description:connection.description||'',
        ...(connection.gap==null?{}:{gap:connectionWireGap(connection)}),
        from:{nodeId:connection.from.nodeId,interfaceId:connection.from.interfaceId},
        to:{nodeId:connection.to.nodeId,interfaceId:connection.to.interfaceId},
        pinMap:(connection.pinMap||[]).map(pair=>({
          from:+pair.from,
          to:+pair.to,
          ...(pair.label?{label:pair.label}:{}),
          ...(pair.style?{style:{...pair.style}}:{})
        }))
      })),
      embeddedBoards:boards.map(toPcbDocument)
    };
  }

  async function readJsonFiles(files) {
    const results = [];
    for (const file of files) { try { results.push(JSON.parse(await file.text())); } catch (_) { toast(`${file.name} 不是有效 JSON`); } }
    return results;
  }

  async function importBoards(files) {
    const docs = await readJsonFiles(files); let count = 0;
    docs.flatMap(d => Array.isArray(d) ? d : [d]).forEach(board => {
      if (board.kind !== 'wiresketch/pcb' || !Array.isArray(board.interfaces)) return;
      const copy = structuredClone(board); if (state.boards.some(b => b.id === copy.id)) copy.id = uid('pcb');
      copy.builtIn=false;
      if(copy.source==='generated')refreshGeneratedBoard(copy);
      state.boards.push(copy); count++;
    });
    if (count) { saveState(); renderBoardList(); renderComponentList(); toast(`已导入 ${count} 块板卡`); } else toast('没有找到有效的 PCB 描述');
  }

  function renderComponentList() {
    $('#componentList').innerHTML = state.boards.map(b => `<div class="component-card" draggable="true" data-id="${b.id}"><img src="${boardImageSource(b) || placeholderSvg(b.name)}" alt=""><span><strong>${escapeHtml(b.name)}</strong><small>${b.interfaces.length} 个接口 · 点击添加</small></span></div>`).join('');
    $$('.component-card').forEach(card => {
      card.onclick = () => addNode(card.dataset.id);
      card.ondragstart = e => e.dataTransfer.setData('text/pcb-id', card.dataset.id);
    });
  }

  function addNode(boardId, at) {
    const board = state.boards.find(b => b.id === boardId); if (!board) return;
    const n = state.assembly.nodes.length;
    state.assembly.nodes.push({id:uid('node'), boardId, label:board.name, x:at?.x ?? 90+(n%4)*285, y:at?.y ?? 70+Math.floor(n/4)*250, rotation:0, flipX:false, scale:1});
    saveState(); renderAssembly();
  }

  function renderAssembly() {
    $('#assemblyName').value = state.assembly.name;
    const canvas=$('#assemblyCanvas'),canvasSize=assemblyCanvasSize(),layer=$('#nodeLayer'),controlLayer=$('#nodeControlLayer'),wireLayer=$('#wireLayer'),controls=[];
    canvas.style.width=`${canvasSize.width*zoom}px`;canvas.style.height=`${canvasSize.height*zoom}px`;canvas.style.backgroundSize=`${18*zoom}px ${18*zoom}px`;
    layer.style.width=`${canvasSize.width}px`;layer.style.height=`${canvasSize.height}px`;
    controlLayer.style.width=`${canvasSize.width}px`;controlLayer.style.height=`${canvasSize.height}px`;
    wireLayer.setAttribute('width',canvasSize.width);wireLayer.setAttribute('height',canvasSize.height);
    layer.style.transform = `scale(${zoom})`;
    controlLayer.style.transform = `scale(${zoom})`;
    wireLayer.style.transform = `scale(${zoom})`;
    layer.innerHTML = state.assembly.nodes.map(node => {
      const board = state.boards.find(b => b.id === node.boardId);
      if (!board) return '';
      const geometry = getBoardImageGeometry(board,node);
      const ports = board.interfaces.map(intf => {
        const anchor = getInterfaceAnchor(board, intf, node);
        const pending = pendingPort?.nodeId === node.id && pendingPort?.interfaceId === intf.id ? 'pending' : '';
        const selected=selectedPort?.nodeId===node.id&&selectedPort?.interfaceId===intf.id?'selected':'';
        const single=interfaceSingleSignalMode(node,intf.id)?'single-mode':'';
        return `<button class="node-port ${anchor.side} ${pending} ${selected} ${single}" style="left:${anchor.x}px;top:${anchor.y}px" data-node="${node.id}" data-interface="${intf.id}" title="${escapeHtml(intf.name)}"><span class="port-dot"></span><span class="port-label">${escapeHtml(intf.name)} · ${intf.pins.length}P${single?' · 单线模式':''}</span></button>`;
      }).join('');
      const pins=board.interfaces.filter(intf=>interfaceSingleSignalMode(node,intf.id)&&(pendingPort?.pin||selectedPort?.nodeId===node.id&&selectedPort?.interfaceId===intf.id)).flatMap(intf=>{
        const anchor=getInterfaceAnchor(board,intf,node),edge=interfaceEdgeGeometry(board,intf,node,baseInterfaceSide(intf.rect)),verticalEdge=anchor.side==='left'||anchor.side==='right';
        const entries=intf.pins.map((name,index)=>{const pin=index+1,point=getPinAnchor(board,intf,pin,node);return {name,index,pin,rank:0,projection:(point.x-anchor.x)*edge.dx+(point.y-anchor.y)*edge.dy};});
        [...entries].sort((first,second)=>first.projection-second.projection).forEach((entry,rank)=>entry.rank=rank);
        return entries.map(entry=>{
          const endpoint={nodeId:node.id,interfaceId:intf.id},connectionCount=pinConnections(endpoint,entry.pin).length,connected=connectionCount>0,pending=pendingPort?.nodeId===node.id&&pendingPort?.interfaceId===intf.id&&pendingPort?.pin===entry.pin;
          const offset=(entry.rank-(entries.length-1)/2)*(verticalEdge?28:82),outward=verticalEdge?53:25;
          const x=anchor.x+anchor.dx*outward+edge.dx*offset,y=anchor.y+anchor.dy*outward+edge.dy*offset,color=pinSignalColor(entry.name,entry.index);
          return `<button class="node-pin ${anchor.side} ${connected?'connected':''} ${pending?'pending':''}" style="left:${x}px;top:${y}px;--pin-color:${color}" data-node="${node.id}" data-interface="${intf.id}" data-pin="${entry.pin}" title="${escapeHtml(intf.name)} / ${escapeHtml(entry.name)}${connected?` · ${connectionCount} 条连接`:''}"><span class="node-pin-dot"></span><b>${entry.pin}</b><span class="node-pin-name">${escapeHtml(entry.name)}</span>${connected?`<i>×${connectionCount}</i>`:''}</button>`;
        });
      }).join('');
      const source=geometry.source,rotation=nodeRotation(node),scaleX=nodeFlipX(node)?-1:1;
      const imageSource=board.source==='generated'?placeholderSvg('',board.generated?.width,board.generated?.height,board.generated?.color):boardImageSource(board);
      const nameOffset=nodeNameOffset(board,node),nameLabel=nodeNameVisible(node)?`<button type="button" class="node-name-label ${node.id===selectedNodeId?'selected':''}" data-node-name="${node.id}" style="left:${geometry.centerX+nameOffset.x}px;top:${geometry.centerY+nameOffset.y}px" title="拖动板卡名称">${escapeHtml(node.label)}</button>`:'';
      controls.push(`<div class="node-controls" data-id="${node.id}" style="left:${node.x}px;top:${node.y}px">${ports}${pins}${nameLabel}</div>`);
      return `<article class="board-node ${node.id===selectedNodeId?'selected':''} ${nodeFixed(node)?'fixed':''}" data-id="${node.id}" style="left:${node.x}px;top:${node.y}px"><div class="node-body">${imageSource?`<img src="${imageSource}" data-board="${board.id}" alt="" style="left:${source.x}px;top:${source.y}px;width:${source.width}px;height:${source.height}px;transform:rotate(${rotation}deg) scaleX(${scaleX});transform-origin:center">`:`<div class="node-placeholder" style="transform:rotate(${rotation}deg) scaleX(${scaleX})"></div>`}</div><footer class="node-header"><span class="node-header-spacer">${nodeFixed(node)?'<span class="node-fixed-mark" title="位置已固定">◆</span>':''}</span><button class="node-action node-scale-down" title="缩小板卡">−</button><span class="node-scale-label">${Math.round(nodeScale(node)*100)}%</span><button class="node-action node-scale-up" title="放大板卡">＋</button><button class="node-action node-flip" title="水平翻转">⇆</button><button class="node-action node-rotate" title="顺时针旋转 90°">↻</button><button class="node-action node-remove" title="移除板卡">×</button></footer></article>`;
    }).join('');
    controlLayer.innerHTML=controls.join('');
    $$('.board-node').forEach(nodeEl => {
      const selectNode=()=>{selectedNodeId=nodeEl.dataset.id;selectedWireId=null;selectedWirePinKey=null;selectedPort=null;renderSelection();};
      nodeEl.onpointerdown = e => { if(e.button!==0)return;if(!e.target.closest('.node-port,.node-pin'))selectNode();const node=state.assembly.nodes.find(item=>item.id===nodeEl.dataset.id);if (!nodeFixed(node)&&!e.target.closest('.node-port,.node-pin,.node-action')) startNodeDrag(e,nodeEl.dataset.id); };
      nodeEl.onclick = e => {if(!e.target.closest('.node-port,.node-pin,.node-action'))selectNode();};
      $('.node-scale-down', nodeEl).onclick = e => { e.stopPropagation(); resizeNode(nodeEl.dataset.id,-.1); };
      $('.node-scale-up', nodeEl).onclick = e => { e.stopPropagation(); resizeNode(nodeEl.dataset.id,.1); };
      $('.node-flip', nodeEl).onclick = e => { e.stopPropagation(); flipNode(nodeEl.dataset.id); };
      $('.node-rotate', nodeEl).onclick = e => { e.stopPropagation(); rotateNode(nodeEl.dataset.id); };
      $('.node-remove', nodeEl).onclick = e => { e.stopPropagation(); removeNode(nodeEl.dataset.id); };
    });
    $$('.node-port').forEach(port => port.onclick = e => { e.stopPropagation(); selectPort(port.dataset.node, port.dataset.interface); });
    $$('.node-pin').forEach(pin=>pin.onclick=e=>{e.stopPropagation();selectedPort={nodeId:pin.dataset.node,interfaceId:pin.dataset.interface};selectedNodeId=null;selectedWireId=null;selectedWirePinKey=null;selectPortPin(Number(pin.dataset.pin));});
    $$('.node-name-label').forEach(label=>{
      label.onpointerdown=e=>{if(e.button!==0)return;e.stopPropagation();startNodeNameDrag(e,label.dataset.nodeName);};
      label.onclick=e=>e.stopPropagation();
    });
    $$('.node-body img[data-board]').forEach(img => {
      const captureSize = () => {
        const board = state.boards.find(b=>b.id===img.dataset.board);
        if (!board?.imageSize && img.naturalWidth) {
          board.imageSize={width:img.naturalWidth,height:img.naturalHeight};
          saveState(); requestAnimationFrame(renderAssembly);
        }
      };
      img.complete ? captureSize() : img.onload=captureSize;
    });
    $('#assemblyEmpty').classList.toggle('hidden', state.assembly.nodes.length > 0);
    $('#nodeCount').textContent = state.assembly.nodes.length;
    $('#wireCount').textContent = state.assembly.connections.reduce((total,connection)=>{
      const from=endpointDetails(connection.from),to=endpointDetails(connection.to);
      return total+(from.intf&&to.intf?connectionPinPairs(connection,from.intf,to.intf).length:0);
    },0);
    $('#zoomLabel').textContent = `${Math.round(zoom*100)}%`;
    renderAssemblyProperties();
    requestAnimationFrame(renderWires);
  }

  function renderSelection() {
    $$('.board-node').forEach(n => n.classList.toggle('selected', n.dataset.id === selectedNodeId));
    $$('.node-name-label').forEach(label=>label.classList.toggle('selected',label.dataset.nodeName===selectedNodeId));
    $$('.node-port').forEach(port=>port.classList.toggle('selected',port.dataset.node===selectedPort?.nodeId&&port.dataset.interface===selectedPort?.interfaceId));
    $$('.wire-group.bundle-selectable').forEach(group=>group.classList.toggle('selected',group.dataset.id===selectedWireId&&!selectedWirePinKey));
    $$('.signal-wire.selectable').forEach(w => w.classList.toggle('selected', w.closest('.wire-group')?.dataset.id===selectedWireId&&w.dataset.pinKey===selectedWirePinKey));
    renderAssemblyProperties();
  }

  function setAssemblyZoom(nextZoom,clientX,clientY) {
    const viewport=$('#assemblyViewport'),rect=viewport.getBoundingClientRect();
    const cursorX=clientX==null?viewport.clientWidth/2:clientX-rect.left;
    const cursorY=clientY==null?viewport.clientHeight/2:clientY-rect.top;
    const logicalX=(viewport.scrollLeft+cursorX)/zoom,logicalY=(viewport.scrollTop+cursorY)/zoom;
    zoom=Math.max(.4,Math.min(1.5,nextZoom));
    renderAssembly();
    viewport.scrollLeft=logicalX*zoom-cursorX;
    viewport.scrollTop=logicalY*zoom-cursorY;
  }

  function wirePinKey(pair) { return `${pair.from}:${pair.to}`; }

  function selectedSignal() {
    const connection=state.assembly.connections.find(item=>item.id===selectedWireId);if(!connection)return null;
    if(connectionMode(connection)!=='signal'||!selectedWirePinKey)return null;
    const from=endpointDetails(connection.from),to=endpointDetails(connection.to);if(!from.intf||!to.intf)return null;
    const signal=connectionPinPairs(connection,from.intf,to.intf).find(pair=>wirePinKey(pair)===selectedWirePinKey);
    return signal?{connection,signal,from,to}:null;
  }

  function selectedBundle() {
    const connection=state.assembly.connections.find(item=>item.id===selectedWireId);
    if(!connection||connectionMode(connection)!=='bundle'||selectedWirePinKey)return null;
    const from=endpointDetails(connection.from),to=endpointDetails(connection.to);
    return from.intf&&to.intf?{connection,from,to}:null;
  }

  function editableSelectedSignal() {
    const selected=selectedSignal();if(!selected)return null;
    if(!selected.connection.pinMap?.length){
      selected.connection.pinMap=connectionPinPairs(selected.connection,selected.from.intf,selected.to.intf).map(pair=>({from:pair.from,to:pair.to}));
    }
    return selected.connection.pinMap.find(pair=>wirePinKey(pair)===selectedWirePinKey)||null;
  }

  function renderAssemblyProperties() {
    const defaults=assemblyWireDefaults(),canvasSize=assemblyCanvasSize();
    $('#defaultWireWidth').value=defaults.width;
    $('#defaultWireWidthValue').value=defaults.width.toFixed(1);
    $('#defaultWireGap').value=defaults.gap;
    $('#defaultWireGapValue').value=defaults.gap;
    $('#defaultRouteGap').value=defaults.routeGap;
    $('#defaultRouteGapValue').value=defaults.routeGap;
    $('#defaultCornerRadius').value=defaults.cornerRadius;
    $('#defaultCornerRadiusValue').value=defaults.cornerRadius;
    $('#canvasWidth').value=canvasSize.width;
    $('#canvasWidthValue').value=canvasSize.width;
    $('#canvasHeight').value=canvasSize.height;
    $('#canvasHeightValue').value=canvasSize.height;
    $('#defaultShowFromLabels').checked=defaults.showFromLabels;
    $('#defaultShowToLabels').checked=defaults.showToLabels;
    const node=state.assembly.nodes.find(item=>item.id===selectedNodeId),board=state.boards.find(item=>item.id===node?.boardId);
    const portNode=state.assembly.nodes.find(item=>item.id===selectedPort?.nodeId),portBoard=state.boards.find(item=>item.id===portNode?.boardId),portInterface=portBoard?.interfaces.find(item=>item.id===selectedPort?.interfaceId);
    const selected=selectedSignal(),bundle=selectedBundle(),hasNode=!!node&&!!board,hasPort=!!portNode&&!!portInterface,hasSignal=!!selected,hasBundle=!!bundle;
    $('#globalPropertyGroup').classList.toggle('hidden',hasNode||hasPort||hasSignal||hasBundle);
    $('#nodePropertyGroup').classList.toggle('hidden',!hasNode||hasPort||hasSignal||hasBundle);
    $('#portPropertyGroup').classList.toggle('hidden',!hasPort||hasSignal||hasBundle);
    $('#wirePropertyGroup').classList.toggle('hidden',!hasSignal);
    $('#bundlePropertyGroup').classList.toggle('hidden',!hasBundle);
    $('#assemblyPropertyTitle').textContent=hasSignal?'信号线属性':hasBundle?'线束属性':hasPort?'端口属性':hasNode?'板卡属性':'全局属性';
    if(node&&board){
      $('#nodePropertySummary').textContent=node.label;
      $('#nodeFixed').checked=nodeFixed(node);
      $('#nodeShowName').checked=nodeNameVisible(node);
      $('#resetNodeNamePositionBtn').disabled=!node.nameOffset;
      $('#nodeInterfaceGaps').innerHTML=board.interfaces.map(intf=>{const override=node.interfaceLabelGaps?.[intf.id]??node.interfaceSignalGaps?.[intf.id],value=override??defaults.gap;return `<div class="interface-gap-row"><span title="${escapeHtml(intf.name)}">${escapeHtml(intf.name)} · ${intf.pins.length}P</span><input type="range" min="0" max="24" step="1" value="${value}" data-interface="${intf.id}" aria-label="${escapeHtml(intf.name)} 信号标签间距"><output>${value}</output><button type="button" class="interface-gap-reset" data-reset-interface="${intf.id}" title="恢复全局 ${defaults.gap}" ${override==null?'disabled':''}>↺</button></div>`;}).join('')||'<div class="compact-empty">此板卡没有接口</div>';
    }
    if(hasPort){
      const single=interfaceSingleSignalMode(portNode,portInterface.id);
      $('#portPropertySummary').innerHTML=`<b>${escapeHtml(portNode.label)}</b><br>${escapeHtml(portInterface.name)} · ${portInterface.pins.length}P`;
      $('#portSingleSignalMode').checked=single;
      $('#portModeHint').textContent=single?'点击画布上的 Pin 托盘选择起点；随后可用的对端托盘会自动展开。':'默认按针脚顺序整束连接，删除时会删除整条线束。';
    }
    if(hasBundle){
      const pairs=connectionPinPairs(bundle.connection,bundle.from.intf,bundle.to.intf),count=pairs.length,gap=connectionWireGap(bundle.connection);
      $('#bundleEndpointSummary').innerHTML=`<b>${escapeHtml(bundle.from.node?.label||'未知板卡')}</b> / ${escapeHtml(bundle.from.intf.name)}<br><b>${escapeHtml(bundle.to.node?.label||'未知板卡')}</b> / ${escapeHtml(bundle.to.intf.name)}<br>${count} 根信号线`;
      $('#bundleRouteGap').value=gap;$('#bundleRouteGapValue').value=gap;
      const fromValues=pairs.map(pair=>signalWireStyle(pair).showFromLabels),toValues=pairs.map(pair=>signalWireStyle(pair).showToLabels);
      $('#bundleShowFromLabels').checked=fromValues.every(Boolean);$('#bundleShowFromLabels').indeterminate=fromValues.some(Boolean)&&!fromValues.every(Boolean);
      $('#bundleShowToLabels').checked=toValues.every(Boolean);$('#bundleShowToLabels').indeterminate=toValues.some(Boolean)&&!toValues.every(Boolean);
    }
    if(!selected)return;
    const {signal,from,to}=selected,style=signalWireStyle(signal);
    $('#wireEndpointSummary').innerHTML=`<b>端点 1</b> ${escapeHtml(from.node?.label||'未知板卡')} / ${escapeHtml(from.intf?.name||'未知接口')} / ${escapeHtml(signal.fromName)}<br><b>端点 2</b> ${escapeHtml(to.node?.label||'未知板卡')} / ${escapeHtml(to.intf?.name||'未知接口')} / ${escapeHtml(signal.toName)}`;
    $('#wireDisplayName').value=signal.label||'';
    $('#wireWidth').value=style.width;
    $('#wireWidthValue').value=style.width.toFixed(1);
    $('#wireCornerRadius').value=style.cornerRadius;
    $('#wireCornerRadiusValue').value=style.cornerRadius;
    const routeGap=connectionWireGap(selected.connection);
    $('#wireRouteGap').value=routeGap;
    $('#wireRouteGapValue').value=routeGap;
    $('#wireShowFromLabels').checked=style.showFromLabels;
    $('#wireShowToLabels').checked=style.showToLabels;
    $('#deleteWireBtn').textContent=connectionMode(selected.connection)==='signal'?'删除此信号线':'删除整条线束';
  }

  function deleteSelectedWire() {
    const connection=state.assembly.connections.find(item=>item.id===selectedWireId);if(!connection)return;
    if(connectionMode(connection)==='signal'){
      const selected=selectedSignal();if(!selected)return;
      selected.connection.pinMap=selected.connection.pinMap.filter(pair=>wirePinKey(pair)!==selectedWirePinKey);
      if(!selected.connection.pinMap.length)state.assembly.connections=state.assembly.connections.filter(connection=>connection!==selected.connection);
    }else state.assembly.connections=state.assembly.connections.filter(item=>item!==connection);
    selectedWireId=null;
    selectedWirePinKey=null;
    saveState();
    renderAssembly();
  }

  function getBoardImageGeometry(board,node) {
    const naturalWidth = board?.imageSize?.width || 420;
    const naturalHeight = board?.imageSize?.height || 260;
    const rotation=nodeRotation(node),quarterTurn=rotation===90||rotation===270,instanceScale=nodeScale(node);
    const rotatedWidth=quarterTurn?naturalHeight:naturalWidth;
    const rotatedHeight=quarterTurn?naturalWidth:naturalHeight;
    const scale=Math.min(NODE.imageWidth/rotatedWidth,NODE.imageHeight/rotatedHeight)*instanceScale;
    const sourceWidth=naturalWidth*scale,sourceHeight=naturalHeight*scale;
    const width=quarterTurn?sourceHeight:sourceWidth,height=quarterTurn?sourceWidth:sourceHeight;
    const centerX=NODE.imageX+NODE.imageWidth/2,centerY=NODE.imageY+NODE.imageHeight/2;
    return {
      rotation,flipX:nodeFlipX(node),scale:instanceScale,centerX,centerY,
      source:{x:centerX-sourceWidth/2,y:centerY-sourceHeight/2,width:sourceWidth,height:sourceHeight},
      bounds:{x:centerX-width/2,y:centerY-height/2,width,height}
    };
  }

  function transformLocalPoint(point,geometry) {
    const dx=(point.x-geometry.centerX)*(geometry.flipX?-1:1),dy=point.y-geometry.centerY;
    if(geometry.rotation===90)return {x:geometry.centerX-dy,y:geometry.centerY+dx};
    if(geometry.rotation===180)return {x:geometry.centerX-dx,y:geometry.centerY-dy};
    if(geometry.rotation===270)return {x:geometry.centerX+dy,y:geometry.centerY-dx};
    return {x:geometry.centerX+dx,y:geometry.centerY+dy};
  }

  function transformDirection(side,node) {
    const order=['top','right','bottom','left'];
    const flipped=nodeFlipX(node)?({left:'right',right:'left',top:'top',bottom:'bottom'})[side]:side;
    return order[(order.indexOf(flipped)+nodeRotation(node)/90)%4];
  }

  function baseInterfaceSide(rect) {
    const centerX = rect.x + rect.w/2, centerY = rect.y + rect.h/2;
    return [
      {side:'left', distance:rect.x, dx:-1, dy:0},
      {side:'right', distance:1-rect.x-rect.w, dx:1, dy:0},
      {side:'top', distance:rect.y, dx:0, dy:-1},
      {side:'bottom', distance:1-rect.y-rect.h, dx:0, dy:1}
    ].sort((a,b)=>a.distance-b.distance)[0];
  }

  function pointOnOriginalBoard(board,node,x,y) {
    const geometry=getBoardImageGeometry(board,node),source=geometry.source;
    return transformLocalPoint({x:source.x+x*source.width,y:source.y+y*source.height},geometry);
  }

  function getInterfaceAnchor(board, intf, node) {
    const rect=intf.rect,base=baseInterfaceSide(rect),side=transformDirection(base.side,node);
    const centerX=rect.x+rect.w/2,centerY=rect.y+rect.h/2;
    const normalized=base.side==='left'?{x:rect.x,y:centerY}:base.side==='right'?{x:rect.x+rect.w,y:centerY}:base.side==='top'?{x:centerX,y:rect.y}:{x:centerX,y:rect.y+rect.h};
    const point=pointOnOriginalBoard(board,node,normalized.x,normalized.y);
    const direction={left:{dx:-1,dy:0},right:{dx:1,dy:0},top:{dx:0,dy:-1},bottom:{dx:0,dy:1}}[side];
    return {...base,...direction,side,...point};
  }

  function displayPinName(label){const value=String(label);const generic=value.match(/^Pin\s*(\d+)$/i);return generic?`P${generic[1]}`:value;}
  function pinTagWidth(label){return Math.max(15,Math.min(46,displayPinName(label).length*4.5+6));}

  function interfaceEdgeGeometry(board,intf,node,base) {
    const first=base.side==='left'?{x:intf.rect.x,y:intf.rect.y}:base.side==='right'?{x:intf.rect.x+intf.rect.w,y:intf.rect.y}:base.side==='top'?{x:intf.rect.x,y:intf.rect.y}:{x:intf.rect.x,y:intf.rect.y+intf.rect.h};
    const last=base.side==='left'?{x:intf.rect.x,y:intf.rect.y+intf.rect.h}:base.side==='right'?{x:intf.rect.x+intf.rect.w,y:intf.rect.y+intf.rect.h}:base.side==='top'?{x:intf.rect.x+intf.rect.w,y:intf.rect.y}:{x:intf.rect.x+intf.rect.w,y:intf.rect.y+intf.rect.h};
    const a=pointOnOriginalBoard(board,node,first.x,first.y),b=pointOnOriginalBoard(board,node,last.x,last.y);
    const span=Math.max(1,Math.hypot(b.x-a.x,b.y-a.y));
    return {span,dx:(b.x-a.x)/span,dy:(b.y-a.y)/span};
  }

  function boardTerminalLayout(board,node) {
    const result=new Map();
    board.interfaces.forEach(intf=>{
      const anchor=getInterfaceAnchor(board,intf,node),base=baseInterfaceSide(intf.rect),count=Math.max(1,intf.pins.length);
      const edge=interfaceEdgeGeometry(board,intf,node,base),span=edge.span,slot=span/count,labelGap=interfaceLabelGap(node,intf.id);
      const horizontalTotal=intf.pins.reduce((sum,pin)=>sum+pinTagWidth(pin),0)+Math.max(0,count-1)*labelGap;
      const tagVertical=(anchor.side==='top'||anchor.side==='bottom')&&horizontalTotal>span;
      const tagThickness=tagVertical?Math.max(5,Math.min(10,slot-1)):anchor.side==='left'||anchor.side==='right'?Math.max(6,Math.min(12,slot-1)):12;
      intf.pins.forEach((pin,index)=>{
        const rotation=interfaceRotation(intf);
        const reversed=(base.side==='top'||base.side==='bottom')?rotation===180:rotation===270;
        const physicalIndex=reversed?count-index-1:index;
        const ratio=(physicalIndex+.5)/count;
        const normalized=base.side==='left'?{x:intf.rect.x,y:intf.rect.y+ratio*intf.rect.h}:base.side==='right'?{x:intf.rect.x+intf.rect.w,y:intf.rect.y+ratio*intf.rect.h}:base.side==='top'?{x:intf.rect.x+ratio*intf.rect.w,y:intf.rect.y}:{x:intf.rect.x+ratio*intf.rect.w,y:intf.rect.y+intf.rect.h};
        const point=pointOnOriginalBoard(board,node,normalized.x,normalized.y);
        const tagShift=(physicalIndex-(count-1)/2)*labelGap;
        result.set(`${intf.id}:${index+1}`,{...anchor,...point,tagX:point.x+edge.dx*tagShift,tagY:point.y+edge.dy*tagShift,tagVertical,tagThickness});
      });
    });
    return result;
  }

  function getPinAnchor(board,intf,pinNumber,node) {
    return boardTerminalLayout(board,node).get(`${intf.id}:${pinNumber}`)||getInterfaceAnchor(board,intf,node);
  }

  function endpointDetails(endpoint) {
    const node=state.assembly.nodes.find(n=>n.id===endpoint.nodeId);
    const board=state.boards.find(b=>b.id===node?.boardId);
    const intf=board?.interfaces.find(i=>i.id===endpoint.interfaceId);
    return {node,board,intf};
  }

  function pinSignalColor(name,index) {
    const signal=String(name||'').toUpperCase().replace(/[\s_-]/g,'');
    if(/GND|GROUND|VSS/.test(signal))return '#17191d';
    if(/VBAT|BAT|VCC|VIN|VOUT|[+]?(?:5V|9V|12V|24V)/.test(signal))return '#ef2f36';
    if(/3V3|3\.3V/.test(signal))return '#f28c28';
    if(/TX|TRANSMIT/.test(signal))return '#55ad55';
    if(/RX|RECEIVE/.test(signal))return '#f0bd24';
    if(/SDA|DATA/.test(signal))return '#4c95d9';
    if(/SCL|CLOCK|CLK/.test(signal))return '#9aa2aa';
    if(/LED|BUZZ/.test(signal))return '#a85ac4';
    if(/^M[1-8]$|MOTOR/.test(signal))return '#5ca9dc';
    return PIN_COLORS[index%PIN_COLORS.length];
  }

  function connectionPinPairs(connection,fromIf,toIf) {
    const fallbackCount=Math.min(fromIf?.pins.length||0,toIf?.pins.length||0);
    const mapping=connection.pinMap?.length?connection.pinMap:Array.from({length:fallbackCount},(_,index)=>({from:index+1,to:index+1}));
    return mapping.filter(pair=>pair.from>=1&&pair.to>=1&&pair.from<=fromIf.pins.length&&pair.to<=toIf.pins.length).map((pair,index)=>{
      const fromName=fromIf.pins[pair.from-1],toName=toIf.pins[pair.to-1];
      return {...pair,fromName,toName,color:pinSignalColor(fromName,index)};
    });
  }

  function pinTagMarkup(point,label,color) {
    const labelWidth=pinTagWidth(label),thickness=point.tagThickness||12;
    const width=point.tagVertical?thickness:labelWidth,height=point.tagVertical?labelWidth:thickness;
    const tagX=point.tagX??point.x,tagY=point.tagY??point.y;
    let x=tagX-width/2,y=tagY-height/2;
    if(point.dx>0)x=tagX+3;
    if(point.dx<0)x=tagX-width-3;
    if(point.dy>0)y=tagY+3;
    if(point.dy<0)y=tagY-height-3;
    const textColor=['#17191d','#4c95d9','#55ad55','#a85ac4'].includes(color)?'#fff':'#172235';
    const centerX=x+width/2,centerY=y+height/2,fontSize=Math.max(5.5,Math.min(7,thickness*.72));
    const transform=point.tagVertical?` transform="rotate(-90 ${centerX} ${centerY})"`:'';
    return `<g class="pin-tag" pointer-events="none"><rect x="${x}" y="${y}" width="${width}" height="${height}" rx="1.5" fill="${color}"/><text x="${centerX}" y="${centerY}" text-anchor="middle" dominant-baseline="central" font-size="${fontSize}" font-weight="800" fill="${textColor}"${transform}>${escapeXml(displayPinName(label))}</text></g>`;
  }

  function pathMidpoint(path) {
    const values=(path.match(/-?\d+(?:\.\d+)?/g)||[]).map(Number),points=[];
    for(let index=0;index<values.length;index+=2)points.push({x:values[index],y:values[index+1]});
    if(points.length<2)return points[0]||{x:0,y:0};
    const lengths=points.slice(1).map((point,index)=>Math.hypot(point.x-points[index].x,point.y-points[index].y));
    const target=lengths.reduce((sum,length)=>sum+length,0)/2;
    let traversed=0;
    for(let index=0;index<lengths.length;index++){
      if(traversed+lengths[index]>=target){
        const ratio=lengths[index]?(target-traversed)/lengths[index]:0;
        return {x:points[index].x+(points[index+1].x-points[index].x)*ratio,y:points[index].y+(points[index+1].y-points[index].y)*ratio};
      }
      traversed+=lengths[index];
    }
    return points.at(-1);
  }

  function wireMiddleLabelMarkup(label,path) {
    const value=String(label||'').trim();if(!value||!path)return '';
    const display=value.length>24?`${value.slice(0,23)}…`:value;
    const point=pathMidpoint(path),width=Math.max(32,display.length*7+16);
    return `<g class="wire-middle-label"><rect x="${point.x-width/2}" y="${point.y-10}" width="${width}" height="20" rx="5"/><text x="${point.x}" y="${point.y}" text-anchor="middle" dominant-baseline="central">${escapeXml(display)}</text></g>`;
  }

  function portPoint(endpoint,pinNumber) {
    const node = state.assembly.nodes.find(n => n.id === endpoint.nodeId), board = state.boards.find(b => b.id === node?.boardId), intf = board?.interfaces.find(i => i.id === endpoint.interfaceId);
    if (!node || !intf) return null;
    const anchor = pinNumber?getPinAnchor(board,intf,pinNumber,node):getInterfaceAnchor(board,intf,node);
    const image=getBoardImageGeometry(board,node).bounds;
    return {...anchor,x:node.x+anchor.x,y:node.y+anchor.y,...(anchor.tagX==null?{}:{tagX:node.x+anchor.tagX,tagY:node.y+anchor.tagY}),box:{left:node.x+image.x,top:node.y+image.y,right:node.x+image.x+image.width,bottom:node.y+image.y+image.height}};
  }

  function routingObstacles() {
    return state.assembly.nodes.map(node=>{
      const board=state.boards.find(b=>b.id===node.boardId),image=getBoardImageGeometry(board,node).bounds,margin=14;
      return {left:node.x+image.x-margin,top:node.y+image.y-margin,right:node.x+image.x+image.width+margin,bottom:node.y+image.y+image.height+margin};
    });
  }

  function segmentIsClear(a,b,obstacles) {
    const epsilon=.1;
    if(Math.abs(a.y-b.y)<epsilon){
      const left=Math.min(a.x,b.x),right=Math.max(a.x,b.x);
      return obstacles.every(box=>!(a.y>box.top+epsilon&&a.y<box.bottom-epsilon&&right>box.left+epsilon&&left<box.right-epsilon));
    }
    if(Math.abs(a.x-b.x)<epsilon){
      const top=Math.min(a.y,b.y),bottom=Math.max(a.y,b.y);
      return obstacles.every(box=>!(a.x>box.left+epsilon&&a.x<box.right-epsilon&&bottom>box.top+epsilon&&top<box.bottom-epsilon));
    }
    return false;
  }

  function segmentHitsBox(a,b,box) {
    const dx=b.x-a.x,dy=b.y-a.y;
    let enter=0,exit=1;
    for(const [origin,delta,min,max] of [[a.x,dx,box.left,box.right],[a.y,dy,box.top,box.bottom]]){
      if(Math.abs(delta)<.0001){if(origin>min&&origin<max)continue;return false;}
      let first=(min-origin)/delta,last=(max-origin)/delta;if(first>last)[first,last]=[last,first];
      enter=Math.max(enter,first);exit=Math.min(exit,last);if(enter>=exit)return false;
    }
    return exit>0&&enter<1;
  }

  function compactOrthogonalPoints(points) {
    const unique=points.filter((point,index)=>!index||Math.abs(point.x-points[index-1].x)>.1||Math.abs(point.y-points[index-1].y)>.1);
    return unique.filter((point,index)=>{
      if(!index||index===unique.length-1)return true;
      const prev=unique[index-1],next=unique[index+1];
      return !((Math.abs(prev.x-point.x)<.1&&Math.abs(point.x-next.x)<.1)||(Math.abs(prev.y-point.y)<.1&&Math.abs(point.y-next.y)<.1));
    });
  }

  function routePath(a,b,laneOffset=0,bundleA=a,bundleB=b) {
    const nearLead=8,routeLead=30,obstacles=routingObstacles();
    const al={x:a.x+a.dx*nearLead,y:a.y+a.dy*nearLead},bl={x:b.x+b.dx*nearLead,y:b.y+b.dy*nearLead};
    const start={x:bundleA.x+bundleA.dx*routeLead+(bundleA.dy?laneOffset:0),y:bundleA.y+bundleA.dy*routeLead+(bundleA.dx?laneOffset:0)};
    const goal={x:bundleB.x+bundleB.dx*routeLead+(bundleB.dy?laneOffset:0),y:bundleB.y+bundleB.dy*routeLead+(bundleB.dx?laneOffset:0)};
    const mixedAxes=(a.dx!==0&&b.dy!==0)||(a.dy!==0&&b.dx!==0);
    const verticalSideBySide=a.dy!==0&&b.dy!==0&&a.dy!==b.dy&&Math.abs(start.x-goal.x)>Math.abs(start.y-goal.y);
    const horizontalStacked=a.dx!==0&&b.dx!==0&&a.dx!==b.dx&&Math.abs(start.y-goal.y)>Math.abs(start.x-goal.x);
    const allowDiagonal=mixedAxes||verticalSideBySide||horizontalStacked;
    if(allowDiagonal&&obstacles.every(box=>!segmentHitsBox(start,goal,box))){
      const direct=compactOrthogonalPoints([a,al,start,goal,bl,b]);
      return direct.map((point,index)=>`${index?'L':'M'}${point.x},${point.y}`).join(' ');
    }
    const candidates=[];
    const add=points=>{
      const clean=compactOrthogonalPoints(points);
      if(clean.every((point,index)=>!index||segmentIsClear(clean[index-1],point,obstacles)))candidates.push(clean);
    };
    add([start,{x:goal.x,y:start.y},goal]);
    add([start,{x:start.x,y:goal.y},goal]);
    const channelXs=[(start.x+goal.x)/2+laneOffset,...obstacles.flatMap(box=>[box.left-40+laneOffset,box.right+40+laneOffset])];
    const channelYs=[(start.y+goal.y)/2+laneOffset,...obstacles.flatMap(box=>[box.top-40+laneOffset,box.bottom+40+laneOffset])];
    channelXs.forEach(x=>add([start,{x,y:start.y},{x,y:goal.y},goal]));
    channelYs.forEach(y=>add([start,{x:start.x,y},{x:goal.x,y},goal]));
    const cost=points=>{
      const length=points.slice(1).reduce((sum,point,index)=>sum+Math.abs(point.x-points[index].x)+Math.abs(point.y-points[index].y),0);
      const xs=points.map(point=>point.x),ys=points.map(point=>point.y);
      const backX=goal.x>=start.x?Math.max(0,start.x-Math.min(...xs)):Math.max(0,Math.max(...xs)-start.x);
      const backY=goal.y>=start.y?Math.max(0,start.y-Math.min(...ys)):Math.max(0,Math.max(...ys)-start.y);
      return length+(points.length-2)*24+(backX+backY)*.45;
    };
    const best=candidates.sort((first,second)=>cost(first)-cost(second))[0]||[start,{x:(start.x+goal.x)/2,y:start.y},{x:(start.x+goal.x)/2,y:goal.y},goal];
    const points=compactOrthogonalPoints([a,al,start,...best.slice(1,-1),goal,bl,b]);
    return points.map((point,index)=>`${index?'L':'M'}${point.x},${point.y}`).join(' ');
  }

  function roundedPath(path,radius) {
    const amount=Math.max(0,Math.min(24,Number(radius)||0));if(!amount)return path;
    const values=(path.match(/-?\d+(?:\.\d+)?/g)||[]).map(Number),points=[];
    for(let index=0;index<values.length;index+=2)points.push({x:values[index],y:values[index+1]});
    if(points.length<3)return path;
    const value=number=>Math.round(number*100)/100;
    let result=`M${value(points[0].x)},${value(points[0].y)}`;
    for(let index=1;index<points.length-1;index++){
      const previous=points[index-1],corner=points[index],next=points[index+1];
      const previousLength=Math.hypot(corner.x-previous.x,corner.y-previous.y),nextLength=Math.hypot(next.x-corner.x,next.y-corner.y);
      const applied=Math.min(amount,previousLength/2,nextLength/2);
      if(applied<.01){result+=` L${value(corner.x)},${value(corner.y)}`;continue;}
      const before={x:corner.x+(previous.x-corner.x)*applied/previousLength,y:corner.y+(previous.y-corner.y)*applied/previousLength};
      const after={x:corner.x+(next.x-corner.x)*applied/nextLength,y:corner.y+(next.y-corner.y)*applied/nextLength};
      result+=` L${value(before.x)},${value(before.y)} Q${value(corner.x)},${value(corner.y)} ${value(after.x)},${value(after.y)}`;
    }
    const last=points.at(-1);
    return `${result} L${value(last.x)},${value(last.y)}`;
  }

  function routedConnectionPairs(connection,pairs) {
    const entries=pairs.map((pair,index)=>({pair,index,a:portPoint(connection.from,pair.from),b:portPoint(connection.to,pair.to)})).filter(entry=>entry.a&&entry.b);
    const laneCoordinate=point=>point.dx!==0?point.y:point.x;
    const laneRanks=new Map([...entries].sort((first,second)=>laneCoordinate(first.a)-laneCoordinate(second.a)||first.index-second.index).map((entry,rank)=>[entry.index,rank]));
    const gap=connectionWireGap(connection);
    return entries.map(entry=>({...entry,laneOffset:(laneRanks.get(entry.index)-(entries.length-1)/2)*gap}));
  }

  function renderWires() {
    $('#wireLayer').innerHTML = state.assembly.connections.map(c => {
      const from=endpointDetails(c.from),to=endpointDetails(c.to);if(!from.intf||!to.intf)return '';
      const pairs=connectionPinPairs(c,from.intf,to.intf),bundleA=portPoint(c.from),bundleB=portPoint(c.to);
      const singleSelectable=connectionMode(c)==='signal',bundleSelected=!singleSelectable&&c.id===selectedWireId&&!selectedWirePinKey;
      const lines=routedConnectionPairs(c,pairs).map(({pair,a,b,laneOffset})=>{
        const style=signalWireStyle(pair),d=roundedPath(routePath(a,b,laneOffset,bundleA,bundleB),style.cornerRadius),pinKey=wirePinKey(pair);
        const selected=singleSelectable&&c.id===selectedWireId&&pinKey===selectedWirePinKey?'selected':'';
        return `<g class="signal-wire ${singleSelectable?'selectable':''} ${selected}" data-pin-key="${pinKey}" style="--wire-width:${style.width}px;--wire-outline-width:${style.width+2.8}px"><path class="wire-hit" d="${d}"/><path class="wire-outline" d="${d}"/><path class="wire-path" d="${d}" stroke="${pair.color}"/>${style.showFromLabels?pinTagMarkup(a,pair.fromName,pair.color):''}${style.showToLabels?pinTagMarkup(b,pair.toName,pair.color):''}${wireMiddleLabelMarkup(pair.label,d)}</g>`;
      }).join('');
      return `<g class="wire-group ${singleSelectable?'':'bundle-selectable'} ${bundleSelected?'selected':''}" data-id="${c.id}">${lines}</g>`;
    }).join('');
    $$('.signal-wire.selectable').forEach(w => w.onclick = e => { e.stopPropagation(); selectedWireId=w.closest('.wire-group').dataset.id;selectedWirePinKey=w.dataset.pinKey;selectedNodeId=null;selectedPort=null;renderSelection(); });
    $$('.wire-group.bundle-selectable').forEach(group=>group.onclick=e=>{e.stopPropagation();selectedWireId=group.dataset.id;selectedWirePinKey=null;selectedNodeId=null;selectedPort=null;renderSelection();});
  }

  function startNodeDrag(e, nodeId) {
    const node = state.assembly.nodes.find(n => n.id===nodeId), canvas=$('#assemblyCanvas').getBoundingClientRect();
    dragState={node, ox:e.clientX-canvas.left-node.x*zoom, oy:e.clientY-canvas.top-node.y*zoom, pointerId:e.pointerId};
    $('#assemblyCanvas').setPointerCapture(e.pointerId); e.preventDefault();
  }

  function startNodeNameDrag(e,nodeId) {
    const node=state.assembly.nodes.find(item=>item.id===nodeId),board=state.boards.find(item=>item.id===node?.boardId);if(!node||!board)return;
    const offset=nodeNameOffset(board,node);
    selectedNodeId=node.id;selectedWireId=null;selectedWirePinKey=null;selectedPort=null;
    nameDragState={node,board,startClientX:e.clientX,startClientY:e.clientY,startX:offset.x,startY:offset.y,pointerId:e.pointerId};
    $('#assemblyCanvas').setPointerCapture(e.pointerId);renderSelection();e.preventDefault();
  }

  function moveNodeName(e) {
    if(!nameDragState)return false;
    const x=nameDragState.startX+(e.clientX-nameDragState.startClientX)/zoom,y=nameDragState.startY+(e.clientY-nameDragState.startClientY)/zoom;
    nameDragState.node.nameOffset={x,y};
    const geometry=getBoardImageGeometry(nameDragState.board,nameDragState.node),label=$(`.node-name-label[data-node-name="${nameDragState.node.id}"]`);
    if(label){label.style.left=`${geometry.centerX+x}px`;label.style.top=`${geometry.centerY+y}px`;}
    return true;
  }

  function endNodeNameDrag() {
    if(!nameDragState)return false;
    nameDragState=null;ignoreCanvasClickUntil=performance.now()+150;saveState();renderAssemblyProperties();return true;
  }

  function moveNode(e) {
    if (!dragState) return;
    const r=$('#assemblyCanvas').getBoundingClientRect();
    dragState.node.x=Math.max(0,(e.clientX-r.left-dragState.ox)/zoom); dragState.node.y=Math.max(0,(e.clientY-r.top-dragState.oy)/zoom);
    const el=$(`.board-node[data-id="${dragState.node.id}"]`),controls=$(`.node-controls[data-id="${dragState.node.id}"]`);
    if(el){el.style.left=`${dragState.node.x}px`;el.style.top=`${dragState.node.y}px`;}
    if(controls){controls.style.left=`${dragState.node.x}px`;controls.style.top=`${dragState.node.y}px`;}
    renderWires();
  }
  function endNodeDrag() { if(dragState){dragState=null;ignoreCanvasClickUntil=performance.now()+150;saveState();} }

  function sameEndpoint(first,second) { return first?.nodeId===second?.nodeId&&first?.interfaceId===second?.interfaceId; }

  function pinConnections(endpoint,pin) {
    const matches=[];
    for(const connection of state.assembly.connections){
      const from=endpointDetails(connection.from),to=endpointDetails(connection.to);if(!from.intf||!to.intf)continue;
      for(const pair of connectionPinPairs(connection,from.intf,to.intf)){
        if(sameEndpoint(connection.from,endpoint)&&pair.from===pin)matches.push({connection,pair});
        if(sameEndpoint(connection.to,endpoint)&&pair.to===pin)matches.push({connection,pair});
      }
    }
    return matches;
  }

  function pinPairExists(first,second) {
    return state.assembly.connections.some(connection=>{
      const from=endpointDetails(connection.from),to=endpointDetails(connection.to);if(!from.intf||!to.intf)return false;
      return connectionPinPairs(connection,from.intf,to.intf).some(pair=>(sameEndpoint(connection.from,first)&&pair.from===first.pin&&sameEndpoint(connection.to,second)&&pair.to===second.pin)||(sameEndpoint(connection.to,first)&&pair.to===first.pin&&sameEndpoint(connection.from,second)&&pair.from===second.pin));
    });
  }

  function selectPort(nodeId, interfaceId) {
    const endpoint={nodeId,interfaceId},node=state.assembly.nodes.find(item=>item.id===nodeId);
    selectedPort=endpoint;selectedNodeId=null;selectedWireId=null;selectedWirePinKey=null;
    if(pendingPort?.pin){
      toast(interfaceSingleSignalMode(node,interfaceId)?'请选择对端信号':'对端也需要开启单信号线连接模式');
      renderAssembly();return;
    }
    if(!pendingPort){
      if(interfaceSingleSignalMode(node,interfaceId))toast('单信号线模式：请在右侧选择一个信号');
      else {pendingPort=endpoint;toast('已选择线束起点，请点击另一个接口');}
      renderAssembly();return;
    }
    if(sameEndpoint(pendingPort,endpoint)){pendingPort=null;toast('已取消连接');renderAssembly();return;}
    if(interfaceSingleSignalMode(node,interfaceId)){toast('两端连接模式不一致，请统一后重试');renderAssembly();return;}
    const duplicate=state.assembly.connections.some(connection=>connectionMode(connection)==='bundle'&&((sameEndpoint(connection.from,pendingPort)&&sameEndpoint(connection.to,endpoint))||(sameEndpoint(connection.to,pendingPort)&&sameEndpoint(connection.from,endpoint))));
    if(duplicate)toast('这两个接口已经存在整束连接');
    else {
      const sourceNode=state.assembly.nodes.find(item=>item.id===pendingPort.nodeId),targetNode=node;
      const sourceIf=state.boards.find(board=>board.id===sourceNode?.boardId)?.interfaces.find(intf=>intf.id===pendingPort.interfaceId);
      const targetIf=state.boards.find(board=>board.id===targetNode?.boardId)?.interfaces.find(intf=>intf.id===interfaceId);
      const count=Math.min(sourceIf?.pins.length||0,targetIf?.pins.length||0);
      const pinMap=Array.from({length:count},(_,index)=>({from:index+1,to:index+1}));
      state.assembly.connections.push({id:uid('wire'),mode:'bundle',from:{...pendingPort},to:endpoint,pinMap});saveState();
      toast(sourceIf?.pins.length===targetIf?.pins.length?'线束连接已创建':'线束连接已创建；两端针脚数量不一致');
    }
    pendingPort=null;renderAssembly();
  }

  function selectPortPin(pin) {
    if(!selectedPort)return;
    const target={...selectedPort,pin},targetNode=state.assembly.nodes.find(item=>item.id===target.nodeId);
    if(!interfaceSingleSignalMode(targetNode,target.interfaceId))return toast('请先开启单信号线连接模式');
    if(!pendingPort){pendingPort=target;toast('已选择信号起点，请选择对端接口和信号');renderAssembly();return;}
    if(!pendingPort.pin)return toast('当前正在建立整束连接，请先取消');
    if(pendingPort.nodeId===target.nodeId&&pendingPort.interfaceId===target.interfaceId&&pendingPort.pin===pin){pendingPort=null;toast('已取消连接');renderAssembly();return;}
    const sourceNode=state.assembly.nodes.find(item=>item.id===pendingPort.nodeId);
    if(!interfaceSingleSignalMode(sourceNode,pendingPort.interfaceId))return toast('起点端口未开启单信号线连接模式');
    if(sameEndpoint(pendingPort,target))return toast('请选择另一个端口的信号');
    if(pinPairExists(pendingPort,target))return toast('这两个信号已经连接');
    const existing=state.assembly.connections.find(connection=>connectionMode(connection)==='signal'&&((sameEndpoint(connection.from,pendingPort)&&sameEndpoint(connection.to,target))||(sameEndpoint(connection.to,pendingPort)&&sameEndpoint(connection.from,target))));
    if(existing){
      if(sameEndpoint(existing.from,pendingPort))existing.pinMap.push({from:pendingPort.pin,to:pin});
      else existing.pinMap.push({from:pin,to:pendingPort.pin});
    }else state.assembly.connections.push({id:uid('wire'),mode:'signal',from:{nodeId:pendingPort.nodeId,interfaceId:pendingPort.interfaceId},to:{nodeId:target.nodeId,interfaceId:target.interfaceId},pinMap:[{from:pendingPort.pin,to:pin}]});
    pendingPort=null;saveState();toast('单信号线连接已创建');renderAssembly();
  }

  function removeNode(id) {
    state.assembly.nodes=state.assembly.nodes.filter(n=>n.id!==id); state.assembly.connections=state.assembly.connections.filter(c=>c.from.nodeId!==id&&c.to.nodeId!==id); selectedNodeId=null;selectedPort=null;pendingPort=null; saveState(); renderAssembly();
  }

  function rotateNode(id) {
    const node=state.assembly.nodes.find(item=>item.id===id);if(!node)return;
    node.rotation=(nodeRotation(node)+90)%360;selectedNodeId=id;selectedWireId=null;selectedWirePinKey=null;
    saveState();renderAssembly();toast(`板卡已旋转到 ${node.rotation}°`);
  }

  function flipNode(id) {
    const node=state.assembly.nodes.find(item=>item.id===id);if(!node)return;
    node.flipX=!nodeFlipX(node);selectedNodeId=id;selectedWireId=null;selectedWirePinKey=null;
    saveState();renderAssembly();toast(node.flipX?'板卡已水平翻转':'板卡已恢复原方向');
  }

  function resizeNode(id,delta) {
    const node=state.assembly.nodes.find(item=>item.id===id);if(!node)return;
    node.scale=Math.round(Math.max(.5,Math.min(2,nodeScale(node)+delta))*10)/10;
    selectedNodeId=id;selectedWireId=null;selectedWirePinKey=null;saveState();renderAssembly();toast(`板卡大小 ${Math.round(node.scale*100)}%`);
  }

  function autoLayout() {
    const nodes=state.assembly.nodes; if(!nodes.length)return;
    const movableNodes=nodes.filter(node=>!nodeFixed(node)),fixedCount=nodes.length-movableNodes.length;
    if(!movableNodes.length)return toast('所有板卡均已固定，布局未改变');
    const largestScale=Math.max(1,...nodes.map(node=>nodeScale(node)));
    const spacingX=255+(largestScale-1)*210,spacingY=210+(largestScale-1)*175;
    const degree=new Map(nodes.map(n=>[n.id,0])),adjacency=new Map(nodes.map(n=>[n.id,[]]));
    state.assembly.connections.forEach(connection=>{
      if(!adjacency.has(connection.from.nodeId)||!adjacency.has(connection.to.nodeId))return;
      adjacency.get(connection.from.nodeId).push({nodeId:connection.to.nodeId,endpoint:connection.from});
      adjacency.get(connection.to.nodeId).push({nodeId:connection.from.nodeId,endpoint:connection.to});
      degree.set(connection.from.nodeId,degree.get(connection.from.nodeId)+1);
      degree.set(connection.to.nodeId,degree.get(connection.to.nodeId)+1);
    });
    const hub=[...nodes].sort((a,b)=>degree.get(b.id)-degree.get(a.id))[0];
    if(!degree.get(hub.id)){
      movableNodes.forEach((node,index)=>{node.x=70+(index%4)*spacingX;node.y=70+Math.floor(index/4)*spacingY;});
    } else {
      const canvas=$('#assemblyCanvas'),logicalWidth=canvas.clientWidth/zoom,logicalHeight=canvas.clientHeight/zoom;
      const desiredCenterX=Math.max(380,logicalWidth/2)-NODE.width/2,desiredCenterY=Math.max(290,logicalHeight/2)-NODE.height/2;
      const centerX=nodeFixed(hub)?hub.x:desiredCenterX,centerY=nodeFixed(hub)?hub.y:desiredCenterY;
      if(!nodeFixed(hub)){hub.x=centerX;hub.y=centerY;}
      const groups={top:[],right:[],bottom:[],left:[]},seen=new Set([hub.id]);
      adjacency.get(hub.id).forEach(link=>{
        if(seen.has(link.nodeId))return;seen.add(link.nodeId);
        const {node,board,intf}=endpointDetails(link.endpoint);
        const side=intf?getInterfaceAnchor(board,intf,node).side:'bottom';
        groups[side].push(nodes.find(n=>n.id===link.nodeId));
      });
      const placeRow=(group,y)=>{const movable=group.filter(node=>!nodeFixed(node));movable.forEach((node,index)=>{node.x=centerX+(index-(movable.length-1)/2)*(spacingX+45);node.y=y;});};
      const placeColumn=(group,x)=>{const movable=group.filter(node=>!nodeFixed(node));movable.forEach((node,index)=>{node.x=x;node.y=centerY+(index-(movable.length-1)/2)*(spacingY+40);});};
      const radialY=280+(largestScale-1)*175,radialX=370+(largestScale-1)*210;
      placeRow(groups.top,centerY-radialY);placeRow(groups.bottom,centerY+radialY);
      placeColumn(groups.left,centerX-radialX);placeColumn(groups.right,centerX+radialX);
      const remaining=nodes.filter(n=>!seen.has(n.id)&&!nodeFixed(n));
      const lowest=Math.max(centerY+radialY,...nodes.filter(n=>seen.has(n.id)).map(n=>n.y));
      remaining.forEach((node,index)=>{node.x=centerX-spacingX+(index%3)*spacingX;node.y=lowest+spacingY+40+Math.floor(index/3)*spacingY;});
    }
    movableNodes.forEach(node=>{const board=state.boards.find(item=>item.id===node.boardId),bounds=getBoardImageGeometry(board,node).bounds;node.x=Math.max(node.x,45-bounds.x);node.y=Math.max(node.y,45-bounds.y);});
    const maxX=Math.max(...nodes.map(node=>{const board=state.boards.find(item=>item.id===node.boardId),bounds=getBoardImageGeometry(board,node).bounds;return node.x+bounds.x+bounds.width;}));
    const maxY=Math.max(...nodes.map(node=>{const board=state.boards.find(item=>item.id===node.boardId),bounds=getBoardImageGeometry(board,node).bounds;return node.y+bounds.y+bounds.height;}));
    const canvas=$('#assemblyCanvas');zoom=Math.max(.4,Math.min(1,(canvas.clientWidth-40)/maxX,(canvas.clientHeight-40)/maxY));
    saveState();renderAssembly();toast(fixedCount?`已自动布局；保留 ${fixedCount} 块固定板卡位置`:'已按接线图方式排列：主控居中，外设环绕');
  }

  function ensureBoardImageSize(board) {
    if (board?.imageSize || !board?.image) return Promise.resolve();
    return new Promise(resolve => {
      const image = new Image();
      image.onload = () => {
        board.imageSize={width:image.naturalWidth,height:image.naturalHeight};
        resolve();
      };
      image.onerror = resolve;
      image.src = board.image;
    });
  }

  function generatedBoardSvg(board,bounds,showName=true) {
    const color=board.generated?.color||'#1d5b42',sx=bounds.width/420,sy=bounds.height/260;
    const traces=[40,80,120,160,200,240,280,320,360,400].map(x=>`<path d="M${x} 18V242"/>`).join('')+[40,80,120,160,200,240].map(y=>`<path d="M18 ${y}H402"/>`).join('');
    const name=showName?`<text x="210" y="137" text-anchor="middle" dominant-baseline="middle" font-size="22" font-weight="800" fill="#eef8f3">${escapeXml(board.name)}</text>`:'';
    return `<g transform="translate(${bounds.x} ${bounds.y}) scale(${sx} ${sy})" filter="url(#shadow)"><rect width="420" height="260" rx="16" fill="${color}" stroke="#cda84b" stroke-width="7"/><g opacity=".22" stroke="#fff" stroke-width="2">${traces}</g><rect x="145" y="82" width="130" height="96" rx="6" fill="#25312d"/>${name}</g>`;
  }

  function buildAssemblySvg() {
    const nodes = state.assembly.nodes;
    const exportWireData=state.assembly.connections.flatMap(connection=>{
      const from=endpointDetails(connection.from),to=endpointDetails(connection.to);if(!from.intf||!to.intf)return [];
      const pairs=connectionPinPairs(connection,from.intf,to.intf),bundleA=portPoint(connection.from),bundleB=portPoint(connection.to);
      return routedConnectionPairs(connection,pairs).map(({pair,index,a,b,laneOffset})=>{
        const style=signalWireStyle(pair);
        return {connection,pair,a,b,style,index,d:roundedPath(routePath(a,b,laneOffset,bundleA,bundleB),style.cornerRadius)};
      });
    });
    const visualBounds=nodes.map(node=>{
      const board=state.boards.find(b=>b.id===node.boardId), image=getBoardImageGeometry(board,node).bounds;
      return {left:node.x+image.x,top:node.y+image.y,right:node.x+image.x+image.width,bottom:node.y+image.y+image.height};
    });
    nodes.forEach(node=>{
      const board=state.boards.find(b=>b.id===node.boardId);if(!board||!nodeNameVisible(node))return;
      const geometry=getBoardImageGeometry(board,node),offset=nodeNameOffset(board,node),x=node.x+geometry.centerX+offset.x,y=node.y+geometry.centerY+offset.y;
      const labelWidth=Math.max(40,Math.min(220,String(node.label).length*7+16));
      visualBounds.push({left:x-labelWidth/2,top:y-11,right:x+labelWidth/2,bottom:y+11});
    });
    exportWireData.forEach(wire=>{
      const values=(wire.d.match(/-?\d+(?:\.\d+)?/g)||[]).map(Number),xs=[],ys=[];
      values.forEach((value,index)=>(index%2?ys:xs).push(value));
      visualBounds.push({left:Math.min(...xs,wire.a.x,wire.b.x)-72,top:Math.min(...ys,wire.a.y,wire.b.y)-24,right:Math.max(...xs,wire.a.x,wire.b.x)+72,bottom:Math.max(...ys,wire.a.y,wire.b.y)+24});
    });
    const minX = Math.min(...visualBounds.map(b=>b.left))-34;
    const minY = Math.min(...visualBounds.map(b=>b.top))-34;
    const maxX = Math.max(...visualBounds.map(b=>b.right))+34;
    const maxY = Math.max(...visualBounds.map(b=>b.bottom))+34;
    const padding=38, headerHeight=58;
    const width=Math.max(420,Math.ceil(maxX-minX+padding*2));
    const height=Math.max(280,Math.ceil(maxY-minY+padding*2+headerHeight));
    const tx=padding-minX, ty=padding+headerHeight-minY;

    const wires = exportWireData.map(({pair,a,b,d,style})=>`<g><path d="${d}" fill="none" stroke="#fff" stroke-width="${style.width+2.8}" stroke-linecap="round" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="${pair.color}" stroke-width="${style.width}" stroke-linecap="square" stroke-linejoin="miter"/>${style.showFromLabels?pinTagMarkup(a,pair.fromName,pair.color):''}${style.showToLabels?pinTagMarkup(b,pair.toName,pair.color):''}${wireMiddleLabelMarkup(pair.label,d)}</g>`).join('');

    const nodeMarkup = nodes.map(node => {
      const board=state.boards.find(b=>b.id===node.boardId); if(!board)return '';
      const geometry=getBoardImageGeometry(board,node),source=geometry.source,scaleX=nodeFlipX(node)?-1:1;
      const imageSource=boardImageSource(board),image=board.source==='generated'?generatedBoardSvg(board,source,false):imageSource?`<image href="${escapeXml(imageSource)}" x="${source.x}" y="${source.y}" width="${source.width}" height="${source.height}" preserveAspectRatio="none" filter="url(#shadow)"/>`:`<rect x="${source.x}" y="${source.y}" width="${source.width}" height="${source.height}" rx="5" fill="#28513f" stroke="#c49b41" stroke-width="5" filter="url(#shadow)"/>`;
      const transform=`translate(${geometry.centerX} ${geometry.centerY}) rotate(${geometry.rotation}) scale(${scaleX} 1) translate(${-geometry.centerX} ${-geometry.centerY})`;
      return `<g transform="translate(${node.x} ${node.y})"><g transform="${transform}">${image}</g></g>`;
    }).join('');

    const nodeNameMarkup=nodes.map(node=>{
      const board=state.boards.find(b=>b.id===node.boardId);if(!board||!nodeNameVisible(node))return '';
      const geometry=getBoardImageGeometry(board,node),offset=nodeNameOffset(board,node),x=node.x+geometry.centerX+offset.x,y=node.y+geometry.centerY+offset.y;
      return `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle" font-family="ui-sans-serif,system-ui,sans-serif" font-size="11" font-weight="800" fill="#25334a" stroke="#fff" stroke-width="4" stroke-linejoin="round" paint-order="stroke">${escapeXml(node.label)}</text>`;
    }).join('');

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs><filter id="shadow" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="5" stdDeviation="5" flood-color="#263951" flood-opacity=".16"/></filter></defs><rect width="100%" height="100%" fill="#fff"/><text x="${padding}" y="38" font-size="20" font-weight="800" fill="#111">${escapeXml(state.assembly.name)}</text><g transform="translate(${tx} ${ty})"><g>${nodeMarkup}</g><g>${wires}</g><g>${nodeNameMarkup}</g></g></svg>`;
  }

  function renderAssemblyDocumentSvg(documentData) {
    if(documentData?.kind!=='wiresketch/assembly'||!Array.isArray(documentData.nodes))throw new Error('Invalid WireSketch assembly');
    const previousState=state;
    state={boards:(documentData.embeddedBoards||[]).map(board=>({...board,builtIn:false})),assembly:{...documentData,embeddedBoards:undefined}};
    state.boards.forEach(board=>{if(board.source==='generated')refreshGeneratedBoard(board);});
    try{return buildAssemblySvg();}finally{state=previousState;}
  }

  async function renderAssemblyImage() {
    if(!state.assembly.nodes.length)return toast('请先向装配体中添加板卡');
    const button=$('#renderAssemblyBtn'), original=button.textContent;
    button.disabled=true;button.textContent='渲染中…';
    try {
      const usedBoards=[...new Set(state.assembly.nodes.map(n=>n.boardId))].map(id=>state.boards.find(b=>b.id===id)).filter(Boolean);
      await Promise.all(usedBoards.map(board=>Promise.all([ensureBoardImageSize(board),ensureTransparentBoardImage(board)])));
      saveState();
      const svg=buildAssemblySvg();
      const svgBlob=new Blob([svg],{type:'image/svg+xml;charset=utf-8'});
      const url=URL.createObjectURL(svgBlob), image=new Image();
      await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;image.src=url;});
      const scale=Math.max(1,Math.min(4,Number($('#exportScale').value)||4));
      const outputWidth=Math.round(image.width*scale),outputHeight=Math.round(image.height*scale);
      if(outputWidth>12000||outputHeight>12000){URL.revokeObjectURL(url);throw new RangeError(`导出尺寸 ${outputWidth} × ${outputHeight} 超过 12000 px`);}
      const canvas=document.createElement('canvas');canvas.width=outputWidth;canvas.height=outputHeight;
      const context=canvas.getContext('2d');context.imageSmoothingEnabled=true;context.imageSmoothingQuality='high';context.scale(scale,scale);context.drawImage(image,0,0);
      URL.revokeObjectURL(url);
      const png=await new Promise(resolve=>canvas.toBlob(resolve,'image/png',.96));
      if(!png)throw new Error('PNG encode failed');
      downloadBlob(png,`${safeFileName(state.assembly.name)}.png`);
      toast(`图片已导出 · ${canvas.width} × ${canvas.height}`);
    } catch(error) {
      console.error(error);toast(error instanceof RangeError?`${error.message}，请选择较低倍率`:'图片渲染失败，请检查板卡图片格式');
    } finally {button.disabled=false;button.textContent=original;}
  }

  async function exportAssemblySvg() {
    if(!state.assembly.nodes.length)return toast('请先向装配体中添加板卡');
    const button=$('#renderAssemblyBtn'),original=button.textContent;
    button.disabled=true;button.textContent='生成中…';
    try {
      const usedBoards=[...new Set(state.assembly.nodes.map(n=>n.boardId))].map(id=>state.boards.find(b=>b.id===id)).filter(Boolean);
      await Promise.all(usedBoards.map(board=>Promise.all([ensureBoardImageSize(board),ensureTransparentBoardImage(board)])));
      saveState();
      downloadBlob(new Blob([buildAssemblySvg()],{type:'image/svg+xml;charset=utf-8'}),`${safeFileName(state.assembly.name)}.svg`);
      toast('SVG 已导出');
    } catch(error) {
      console.error(error);toast('SVG 导出失败，请检查板卡图片格式');
    } finally {button.disabled=false;button.textContent=original;}
  }

  function exportAssembly() {
    downloadJson(toAssemblyDocument(), state.assembly.name+'.assembly');
  }

  async function importAssembly(file) {
    const [doc]=await readJsonFiles([file]); if(doc?.kind!=='wiresketch/assembly'||!Array.isArray(doc.nodes))return toast('不是有效的装配体描述文件');
    loadAssemblyDocument(doc);
  }

  function loadAssemblyDocument(doc) {
    if(doc?.kind!=='wiresketch/assembly'||!Array.isArray(doc.nodes))return false;
    (doc.embeddedBoards||[]).forEach(board=>{if(!state.boards.some(b=>b.id===board.id)){board.builtIn=false;if(board.source==='generated')refreshGeneratedBoard(board);state.boards.push(board);}});
    state.assembly={...doc,embeddedBoards:undefined}; selectedNodeId=null;selectedWireId=null;selectedWirePinKey=null;selectedPort=null;pendingPort=null;saveState();renderComponentList();renderAssembly();toast('装配体已打开');
    return true;
  }

  async function bootstrapAssemblyPreview() {
    const params=new URLSearchParams(location.search),source=params.get('assembly');if(!source)return;
    try {
      const doc=await fetch(source).then(response=>{if(!response.ok)throw new Error(`HTTP ${response.status}`);return response.json();});
      if(!loadAssemblyDocument(doc))throw new Error('Invalid assembly');
      if(params.get('render')==='svg'){
        await Promise.all(state.boards.map(board=>Promise.all([ensureBoardImageSize(board),ensureTransparentBoardImage(board)])));
        document.documentElement.innerHTML=`<head><meta charset="UTF-8"><title>${escapeHtml(state.assembly.name)}</title><style>html,body{margin:0;background:#fff}svg{display:block}</style></head><body>${buildAssemblySvg()}</body>`;
      }else switchView('assembly');
    }catch(error){console.error(error);toast('无法加载 URL 中的装配体');}
  }

  let toastTimer;
  function toast(message) { const el=$('#connectionToast'); el.textContent=message;el.classList.remove('hidden');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.add('hidden'),2200); }

  function bindEvents() {
    $$('.mode-btn').forEach(b=>b.onclick=()=>switchView(b.dataset.view));
    $('#newBoardBtn').onclick=newBoard; $('#boardSearch').oninput=renderBoardList;
    $('#uploadImageBtn').onclick=()=>$('#imageInput').click(); $('#replaceImageBtn').onclick=()=>$('#imageInput').click();
    $('#imageInput').onchange=e=>{handleImage(e.target.files[0]);e.target.value='';};
    $('#boardZoomInBtn').onclick=()=>changeBoardZoom(1.25);
    $('#boardZoomOutBtn').onclick=()=>changeBoardZoom(.8);
    $('#boardZoomFitBtn').onclick=fitBoardImage;
    $('#boardName').oninput=e=>{
      const board=currentBoard();if(!board)return;
      board.name=e.target.value||'未命名板卡';
      state.assembly.nodes.filter(node=>node.boardId===board.id).forEach(node=>{node.label=board.name;});
      $('#boardBreadcrumb').textContent=board.name;
      if(board.source==='generated')redrawGeneratedBoard(board);else{saveState();renderBoardList();renderComponentList();}
    };
    $('#virtualBoardWidth').onchange=applyVirtualBoardSettings;
    $('#virtualBoardHeight').onchange=applyVirtualBoardSettings;
    $('#virtualBoardColor').oninput=applyVirtualBoardSettings;
    $('#pickTransparentColorBtn').onclick=()=>setTransparentColorPicking(!transparentColorPicking);
    $('#clearTransparentColorBtn').onclick=clearTransparentColor;
    $('#imageRotationSlider').oninput=e=>{$('#imageRotationAngle').value=e.target.value;previewImportedImageRotation(e.target.value);};
    $('#imageRotationSlider').onchange=e=>rotateImportedImage(e.target.value);
    $('#imageRotationAngle').oninput=e=>{const value=e.target.value;syncImageRotationControls(currentBoard());$('#imageRotationAngle').value=value;$('#imageRotationSlider').value=normalizedImageRotation(value);};
    $('#imageRotationAngle').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();rotateImportedImage(e.target.value);}else if(e.key==='Escape')syncImageRotationControls();};
    $('#imageStage').onpointerdown=onStagePointerDown;$('#imageStage').onpointermove=onStagePointerMove;$('#imageStage').onpointerup=onStagePointerUp;$('#imageStage').onpointercancel=onStagePointerUp;
    $('#imageStage').addEventListener('wheel',e=>{if(e.ctrlKey||e.metaKey){e.preventDefault();changeBoardZoom(e.deltaY<0?1.12:.89);}},{passive:false});
    $('#interfaceName').oninput=e=>{const i=currentInterface();i.name=e.target.value;saveState();renderInterfaces();renderBoardList();};
    $('#interfaceType').onchange=e=>{const i=currentInterface();applyInterfaceTypeDefaults(i,e.target.value);$('#pinCount').value=i.pins.length;saveState();renderPins(i);renderInterfaces();renderBoardList();};
    $('#interfaceRotation').onchange=e=>{const i=currentInterface();i.rotation=Number(e.target.value);saveState();renderInterfaces();if($('#assemblyView').classList.contains('active'))renderAssembly();};
    $('#pinCount').onchange=e=>{const i=currentInterface(),count=Math.max(1,Math.min(64,+e.target.value||1));while(i.pins.length<count)i.pins.push(`Pin ${i.pins.length+1}`);i.pins.length=count;e.target.value=count;saveState();renderPins(i);renderInterfaces();renderBoardList();};
    $('#deleteInterfaceBtn').onclick=deleteSelectedInterface;
    $('#imageStage').onkeydown=e=>{if((e.key==='Delete'||e.key==='Backspace')&&selectedInterfaceId){e.preventDefault();deleteSelectedInterface();}};
    $('#exportBoardBtn').onclick=()=>{const b=currentBoard();downloadJson(toPcbDocument(b),b.name+'.pcb');};
    $('#importBoardsBtn').onclick=()=>$('#importBoardsInput').click();$('#importBoardsInput').onchange=e=>{importBoards([...e.target.files]);e.target.value='';};
    $('#assemblyImportBoardsBtn').onclick=()=>$('#assemblyImportBoardsInput').click();$('#assemblyImportBoardsInput').onchange=e=>{importBoards([...e.target.files]);e.target.value='';};
    $('#assemblyName').oninput=e=>{state.assembly.name=e.target.value||'新建连接图';saveState();};
    const syncExportControls=()=>{const svg=$('#exportFormat').value==='svg';$('#exportScale').disabled=svg;$('#renderAssemblyBtn').textContent=svg?'导出 SVG':'导出 PNG';};
    $('#exportFormat').onchange=syncExportControls;syncExportControls();
    $('#autoLayoutBtn').onclick=autoLayout;$('#renderAssemblyBtn').onclick=()=>$('#exportFormat').value==='svg'?exportAssemblySvg():renderAssemblyImage();$('#exportAssemblyBtn').onclick=exportAssembly;
    $('#clearAssemblyBtn').onclick=()=>{if(!state.assembly.nodes.length||confirm('确定清空当前装配画布吗？')){state.assembly.nodes=[];state.assembly.connections=[];selectedNodeId=null;selectedWireId=null;selectedWirePinKey=null;selectedPort=null;pendingPort=null;saveState();renderAssembly();}};
    $('#importAssemblyBtn').onclick=()=>$('#importAssemblyInput').click();$('#importAssemblyInput').onchange=e=>{if(e.target.files[0])importAssembly(e.target.files[0]);e.target.value='';};
    $('#defaultWireWidth').oninput=e=>{const value=Math.max(1,Math.min(8,+e.target.value||DEFAULT_WIRE_STYLE.width));updateAssemblyWireDefaults({width:value});$('#defaultWireWidthValue').value=value.toFixed(1);saveState();renderWires();};
    $('#defaultWireGap').oninput=e=>{const value=Math.max(0,Math.min(24,Number(e.target.value)||0));updateAssemblyWireDefaults({labelGap:value});$('#defaultWireGapValue').value=value;saveState();renderWires();};
    $('#defaultRouteGap').oninput=e=>{const value=Math.max(0,Math.min(20,Number(e.target.value)));updateAssemblyWireDefaults({routeGap:value});$('#defaultRouteGapValue').value=value;saveState();renderWires();};
    $('#defaultCornerRadius').oninput=e=>{const value=Math.max(0,Math.min(24,Number(e.target.value)));updateAssemblyWireDefaults({cornerRadius:value});$('#defaultCornerRadiusValue').value=value;saveState();renderWires();};
    $('#canvasWidth').oninput=e=>{const size=assemblyCanvasSize();state.assembly.canvasSize={...size,width:+e.target.value};$('#canvasWidthValue').value=e.target.value;saveState();renderAssembly();};
    $('#canvasHeight').oninput=e=>{const size=assemblyCanvasSize();state.assembly.canvasSize={...size,height:+e.target.value};$('#canvasHeightValue').value=e.target.value;saveState();renderAssembly();};
    $('#defaultShowFromLabels').onchange=e=>{updateAssemblyWireDefaults({showFromLabels:e.target.checked});saveState();renderAssemblyProperties();renderWires();};
    $('#defaultShowToLabels').onchange=e=>{updateAssemblyWireDefaults({showToLabels:e.target.checked});saveState();renderAssemblyProperties();renderWires();};
    $('#nodeInterfaceGaps').oninput=e=>{const input=e.target.closest('input[data-interface]'),node=state.assembly.nodes.find(item=>item.id===selectedNodeId);if(!input||!node)return;node.interfaceLabelGaps=node.interfaceLabelGaps||{};node.interfaceLabelGaps[input.dataset.interface]=Math.max(0,Math.min(24,Number(input.value)||0));delete node.interfaceSignalGaps;const output=input.nextElementSibling;if(output)output.value=input.value;const reset=input.parentElement.querySelector('.interface-gap-reset');if(reset)reset.disabled=false;saveState();renderWires();};
    $('#nodeInterfaceGaps').onclick=e=>{const button=e.target.closest('[data-reset-interface]'),node=state.assembly.nodes.find(item=>item.id===selectedNodeId);if(!button||!node)return;delete node.interfaceLabelGaps?.[button.dataset.resetInterface];delete node.interfaceSignalGaps?.[button.dataset.resetInterface];if(node.interfaceLabelGaps&&!Object.keys(node.interfaceLabelGaps).length)delete node.interfaceLabelGaps;if(node.interfaceSignalGaps&&!Object.keys(node.interfaceSignalGaps).length)delete node.interfaceSignalGaps;saveState();renderAssemblyProperties();renderWires();};
    $('#resetNodeGapsBtn').onclick=()=>{const node=state.assembly.nodes.find(item=>item.id===selectedNodeId);if(!node)return;delete node.interfaceLabelGaps;delete node.interfaceSignalGaps;saveState();renderAssemblyProperties();renderWires();};
    $('#nodeFixed').onchange=e=>{const node=state.assembly.nodes.find(item=>item.id===selectedNodeId);if(!node)return;node.fixed=e.target.checked;saveState();renderAssembly();toast(node.fixed?'板卡位置已固定':'板卡位置已解除固定');};
    $('#nodeShowName').onchange=e=>{const node=state.assembly.nodes.find(item=>item.id===selectedNodeId);if(!node)return;node.showName=e.target.checked;saveState();renderAssembly();};
    $('#resetNodeNamePositionBtn').onclick=()=>{const node=state.assembly.nodes.find(item=>item.id===selectedNodeId);if(!node)return;delete node.nameOffset;saveState();renderAssembly();};
    $('#portSingleSignalMode').onchange=e=>{const node=state.assembly.nodes.find(item=>item.id===selectedPort?.nodeId);if(!node||!selectedPort)return;const conflicting=state.assembly.connections.some(connection=>connectionMode(connection)===(e.target.checked?'bundle':'signal')&&(sameEndpoint(connection.from,selectedPort)||sameEndpoint(connection.to,selectedPort)));if(conflicting){e.target.checked=!e.target.checked;toast(e.target.checked?'请先删除该端口的单信号线连接':'请先删除该端口的整束连接');return;}node.interfaceConnectionModes=node.interfaceConnectionModes||{};if(e.target.checked)node.interfaceConnectionModes[selectedPort.interfaceId]='signal';else delete node.interfaceConnectionModes[selectedPort.interfaceId];if(!Object.keys(node.interfaceConnectionModes).length)delete node.interfaceConnectionModes;if(sameEndpoint(pendingPort,selectedPort))pendingPort=null;saveState();renderAssembly();toast(e.target.checked?'已开启单信号线连接模式':'已恢复整束连接模式');};
    $('#wireDisplayName').oninput=e=>{const signal=editableSelectedSignal();if(!signal)return;signal.label=e.target.value;saveState();renderWires();};
    $('#wireWidth').oninput=e=>{const signal=editableSelectedSignal();if(!signal)return;signal.style=signal.style||{};signal.style.width=Math.max(1,Math.min(8,+e.target.value||assemblyWireDefaults().width));$('#wireWidthValue').value=signal.style.width.toFixed(1);saveState();renderWires();};
    $('#wireCornerRadius').oninput=e=>{const signal=editableSelectedSignal();if(!signal)return;signal.style=signal.style||{};signal.style.cornerRadius=Math.max(0,Math.min(24,Number(e.target.value)));$('#wireCornerRadiusValue').value=signal.style.cornerRadius;saveState();renderWires();};
    $('#wireRouteGap').oninput=e=>{const selected=selectedSignal();if(!selected)return;selected.connection.gap=Math.max(0,Math.min(20,Number(e.target.value)));$('#wireRouteGapValue').value=selected.connection.gap;saveState();renderWires();};
    $('#resetWireGapBtn').onclick=()=>{const selected=selectedSignal();if(!selected)return;delete selected.connection.gap;saveState();renderAssemblyProperties();renderWires();};
    $('#bundleRouteGap').oninput=e=>{const selected=selectedBundle();if(!selected)return;selected.connection.gap=Math.max(0,Math.min(20,Number(e.target.value)));$('#bundleRouteGapValue').value=selected.connection.gap;saveState();renderWires();};
    $('#resetBundleGapBtn').onclick=()=>{const selected=selectedBundle();if(!selected)return;delete selected.connection.gap;saveState();renderAssemblyProperties();renderWires();};
    const setBundleLabelVisibility=(side,visible)=>{const selected=selectedBundle();if(!selected)return;if(!selected.connection.pinMap?.length)selected.connection.pinMap=connectionPinPairs(selected.connection,selected.from.intf,selected.to.intf).map(pair=>({from:pair.from,to:pair.to}));selected.connection.pinMap.forEach(pair=>{pair.style={...(pair.style||{}),[side]:visible};});saveState();renderAssemblyProperties();renderWires();};
    $('#bundleShowFromLabels').onchange=e=>setBundleLabelVisibility('showFromLabels',e.target.checked);
    $('#bundleShowToLabels').onchange=e=>setBundleLabelVisibility('showToLabels',e.target.checked);
    $('#wireShowFromLabels').onchange=e=>{const signal=editableSelectedSignal();if(!signal)return;signal.style={...(signal.style||{}),showFromLabels:e.target.checked};saveState();renderWires();};
    $('#wireShowToLabels').onchange=e=>{const signal=editableSelectedSignal();if(!signal)return;signal.style={...(signal.style||{}),showToLabels:e.target.checked};saveState();renderWires();};
    $('#resetWireStyleBtn').onclick=()=>{const signal=editableSelectedSignal();if(!signal)return;delete signal.style;saveState();renderAssemblyProperties();renderWires();};
    $('#deleteWireBtn').onclick=deleteSelectedWire;
    $('#deleteBundleBtn').onclick=deleteSelectedWire;
    const canvas=$('#assemblyCanvas');canvas.ondragover=e=>e.preventDefault();canvas.ondrop=e=>{e.preventDefault();const id=e.dataTransfer.getData('text/pcb-id'),r=canvas.getBoundingClientRect();if(id)addNode(id,{x:(e.clientX-r.left)/zoom-NODE.width/2,y:(e.clientY-r.top)/zoom-NODE.height/2});};
    canvas.onpointermove=e=>{if(!moveNodeName(e))moveNode(e);};canvas.onpointerup=()=>{if(!endNodeNameDrag())endNodeDrag();};canvas.onpointercancel=()=>{if(!endNodeNameDrag())endNodeDrag();};
    canvas.onclick=e=>{if(performance.now()<ignoreCanvasClickUntil)return;if(e.target===canvas||e.target.id==='nodeLayer'||e.target.id==='nodeControlLayer'){selectedNodeId=null;selectedWireId=null;selectedWirePinKey=null;selectedPort=null;pendingPort=null;renderAssembly();}};
    $('#assemblyViewport').addEventListener('wheel',e=>{e.preventDefault();setAssemblyZoom(zoom*(e.deltaY<0?1.1:.9),e.clientX,e.clientY);},{passive:false});
    $('#zoomInBtn').onclick=()=>setAssemblyZoom(zoom+.1);$('#zoomOutBtn').onclick=()=>setAssemblyZoom(zoom-.1);
    document.onkeydown=e=>{
      if(!$('#assemblyView').classList.contains('active')||['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName))return;
      if(e.key==='Escape'&&pendingPort){e.preventDefault();pendingPort=null;renderAssembly();toast('已取消连接');return;}
      if((e.key==='r'||e.key==='R')&&selectedNodeId){e.preventDefault();rotateNode(selectedNodeId);return;}
      if((e.key==='f'||e.key==='F')&&selectedNodeId){e.preventDefault();flipNode(selectedNodeId);return;}
      if(e.key==='Delete'||e.key==='Backspace'){
        if(selectedWireId)deleteSelectedWire();
        else if(selectedNodeId)removeNode(selectedNodeId);
      }
    };
    $('#helpBtn').onclick=()=>$('#helpDialog').showModal();$('.dialog-close').onclick=()=>$('#helpDialog').close();
    window.onresize=()=>{syncOverlay();if($('#assemblyView').classList.contains('active'))renderWires();};
  }

  globalThis.WireSketchRenderer={renderAssemblyDocumentSvg};
  if(typeof document!=='undefined'){
    bindEvents();renderBoardList();renderBoardEditor();bootstrapAssemblyPreview();
    Promise.all(state.boards.filter(board=>board.backgroundTransparency).map(ensureTransparentBoardImage)).then(()=>{renderBoardList();renderComponentList();if($('#assemblyView').classList.contains('active'))renderAssembly();}).catch(error=>console.error('Background transparency processing failed',error));
  }
})();
