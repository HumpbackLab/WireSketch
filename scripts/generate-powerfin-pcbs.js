#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function imageDataUrl(fileName) {
  const bytes = fs.readFileSync(path.join(root, fileName));
  return `data:image/png;base64,${bytes.toString('base64')}`;
}

function connector(id, name, type, rect, rotation, pins, silk) {
  return {
    id,
    name,
    type,
    description: `Pin 1 由接口旁白色三角形标记。板上丝印线序：${silk}。`,
    rect,
    rotation,
    pins
  };
}

function documentFor({ id, name, description, image, interfaces }) {
  return {
    schema: 'urn:wiresketch:schema:pcb:1.0',
    schemaVersion: '1.1.0',
    kind: 'wiresketch/pcb',
    version: 1,
    id,
    name,
    description,
    coordinateSystem: {
      origin: 'top-left',
      axisX: 'right',
      axisY: 'down',
      regionUnit: 'normalized'
    },
    image: imageDataUrl(image),
    imageSize: { width: 4000, height: 4053, unit: 'px' },
    source: 'image',
    interfaces
  };
}

const top = documentFor({
  id: 'pcb_powerfin_v1_top',
  name: 'PowerFin V1.0 · Top',
  description: 'PowerFin V1.0 正面视图。接口框按 powerfin_top.png 标注；pins 数组严格从白色三角形所示 Pin 1 开始。缩写已展开为常用信号名，原始丝印保留在各接口 description 中。USB-C 未列入线序接口，因为图片没有提供其焊盘级物理针序。',
  image: 'powerfin_top.png',
  interfaces: [
    connector('if_i2c1', 'I2C1', 'i2c',
      { x: 0.225, y: 0.01, w: 0.165, h: 0.125 },
      180,
      ['5V', 'GND', 'SCL', 'SDA'], '5V, G, CK, SDA'),
    connector('if_uart1', 'UART1', 'uart',
      { x: 0.4, y: 0.01, w: 0.165, h: 0.125 },
      180,
      ['5V', 'GND', 'RX', 'TX'], '5V, G, R, T'),
    connector('if_uart4', 'UART4', 'uart',
      { x: 0.59, y: 0.01, w: 0.165, h: 0.125 },
      180,
      ['5V', 'GND', 'RX', 'TX'], '5V, G, R, T'),
    connector('if_spi1', 'SPI1', 'spi',
      { x: 0.01, y: 0.335, w: 0.125, h: 0.215 },
      90,
      ['5V', 'GND', 'SCK', 'MISO', 'MOSI', 'CS'], '5V, G, SC, MI, MO, CS'),
    connector('if_uart5', 'UART5', 'uart',
      { x: 0.01, y: 0.57, w: 0.125, h: 0.18 },
      90,
      ['5V', 'GND', 'RX', 'TX'], '5V, G, R, T'),
    connector('if_vtx_dji', 'VTX-DJI', 'video',
      { x: 0.86, y: 0.335, w: 0.13, h: 0.215 },
      270,
      ['10V', 'GND', 'TX', 'RX', 'GND', 'SBUS'], '10V, G, T, R, G, SBUS'),
    connector('if_vtx_a', 'VTX-A', 'video',
      { x: 0.86, y: 0.57, w: 0.13, h: 0.18 },
      270,
      ['10V', 'GND', 'TX', 'VIDEO'], '10V, G, T, V'),
    connector('if_led', 'LED', 'led',
      { x: 0.23, y: 0.855, w: 0.14, h: 0.135 },
      0,
      ['5V', 'GND', 'LED'], '5V, G, LED'),
    connector('if_can', 'CAN', 'can',
      { x: 0.37, y: 0.855, w: 0.175, h: 0.135 },
      0,
      ['5V', 'GND', 'CAN_L', 'CAN_H'], '5V, G, L, H')
  ]
});

const bottom = documentFor({
  id: 'pcb_powerfin_v1_bottom',
  name: 'PowerFin V1.0 · Bottom',
  description: 'PowerFin V1.0 背面视图。接口框按 powerfin_bottom.png 标注；pins 数组严格从白色三角形所示 Pin 1 开始。ESC 的 C、X 信号无法仅凭图片可靠展开，因此保留原始丝印名。microSD 未列入外部接线接口。',
  image: 'powerfin_bottom.png',
  interfaces: [
    connector('if_uart0', 'UART0', 'uart',
      { x: 0.595, y: 0.01, w: 0.165, h: 0.125 },
      180,
      ['5V', 'GND', 'RX', 'TX'], '5V, G, R, T'),
    connector('if_esc', 'ESC', 'esc',
      { x: 0.01, y: 0.215, w: 0.13, h: 0.27 },
      90,
      ['V', 'GND', 'C', 'X', '1', '2', '3', '4'], 'V, G, C, X, 1, 2, 3, 4'),
    connector('if_uart3', 'UART3', 'uart',
      { x: 0.86, y: 0.21, w: 0.13, h: 0.18 },
      270,
      ['5V', 'GND', 'RX', 'TX'], '5V, G, R, T'),
    connector('if_vrx', 'VRX', 'video',
      { x: 0.27, y: 0.84, w: 0.14, h: 0.15 },
      0,
      ['5V', 'GND', 'VR'], '5V, G, VR')
  ]
});

for (const [fileName, doc] of [
  ['powerfin_top.pcb.json', top],
  ['powerfin_bottom.pcb.json', bottom]
]) {
  fs.writeFileSync(path.join(root, fileName), `${JSON.stringify(doc, null, 2)}\n`);
  process.stdout.write(`${fileName}: ${doc.interfaces.length} interfaces\n`);
}
