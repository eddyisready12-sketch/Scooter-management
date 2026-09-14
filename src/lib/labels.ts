import * as bwipjs from 'bwip-js';
import Dymo from 'dymo-connect';
import rsoLogoUrl from '../assets/rso-logo.png';
import { findPackagingMaterialOption, packagingMaterialOptions } from './packaging-materials';
import { isStickerPackagingLayer, normalizePackagingLayers } from './products';
import type { Dealer, Product, ProductPackagingLayer, Scooter } from '../types';

const packagingLayerNames = Array.from({ length: 10 }, (_, index) => `Verpakkingscomponent ${index + 1}`);

function formatQuantity(value?: string | number | null) {
  const numericValue = typeof value === 'number' ? value : Number(String(value ?? '').replace(',', '.'));
  if (!Number.isFinite(numericValue)) return '0';
  return numericValue.toLocaleString('nl-NL', { maximumFractionDigits: 2 });
}

export type DymoBrowserPrinter = {
  name: string;
  model: string;
  connected: boolean;
  local: boolean;
  twinTurbo: boolean;
};

export type ZebraBrowserPrinter = {
  deviceType?: string;
  name?: string;
  uid?: string;
  connection?: string;
  provider?: string;
  manufacturer?: string;
  version?: number;
};

export const dymo99012Layout = {
  // DYMO 99012 / S0722400 compatible large address labels (89 mm x 36 mm).
  id: 'LargeAddress',
  paperName: '30321 Large Address',
  width: 5046,
  height: 2040,
  barcodeBounds: { x: 180, y: 80, width: 4686, height: 760 },
  frameBounds: { x: 180, y: 860, width: 4686, height: 260 },
  detailsBounds: { x: 180, y: 1160, width: 4686, height: 700 },
};

export type ZebraProductLabelSize = '80x42' | '80x36';
export type ZebraPrinterDpi = 203 | 300;

export const zebraProductLabelLayouts: Record<ZebraProductLabelSize, { width: number; height: number; widthMm: number; heightMm: number; label: string }> = {
  // The design grid uses the original 203-DPI coordinates. Raster output is
  // scaled to the selected printer's native resolution before it is sent.
  '80x42': { width: 640, height: 336, widthMm: 80, heightMm: 42, label: '80 x 42 mm' },
  '80x36': { width: 640, height: 288, widthMm: 80, heightMm: 36, label: '80 x 36 mm' },
};

const zebraPrinterDpiStorageKey = 'rso-zebra-printer-dpi';

export function readZebraPrinterDpi(): ZebraPrinterDpi {
  if (typeof window === 'undefined') return 203;
  return window.localStorage.getItem(zebraPrinterDpiStorageKey) === '300' ? 300 : 203;
}

export function saveZebraPrinterDpi(dpi: ZebraPrinterDpi) {
  window.localStorage.setItem(zebraPrinterDpiStorageKey, String(dpi));
}

function zebraRasterLayout(size: ZebraProductLabelSize, dpi = readZebraPrinterDpi()) {
  const design = zebraProductLabelLayouts[size];
  return {
    ...design,
    dpi,
    rasterWidth: Math.round((design.widthMm / 25.4) * dpi),
    rasterHeight: Math.round((design.heightMm / 25.4) * dpi),
  };
}

export function escapeZplField(value: string) {
  return value
    .replace(/\\/g, '\\5C')
    .replace(/\^/g, '\\5E')
    .replace(/~/g, '\\7E')
    .replace(/[^\x20-\x7E]/g, (character) => {
      const bytes = new TextEncoder().encode(character);
      return Array.from(bytes, (byte) => `\\${byte.toString(16).padStart(2, '0').toUpperCase()}`).join('');
    });
}

export function truncateLabelText(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length > maxLength ? `${normalized.slice(0, Math.max(0, maxLength - 3))}...` : normalized;
}

export function buildZebraProductLabelZpl(product: Product, size: ZebraProductLabelSize) {
  const layout = zebraProductLabelLayouts[size];
  const barcodeSource = product.barcode?.trim() || product.code.trim();
  if (!barcodeSource) {
    throw new Error('Product heeft geen barcode of code om te printen.');
  }

  const batchCode = product.batchNumber?.trim() || product.batch?.trim() || product.traceabilityCode?.trim();
  if (!batchCode) {
    throw new Error('Product heeft geen batchcode om als QR-code te printen.');
  }

  const code = escapeZplField(product.code.trim() || barcodeSource);
  const description = escapeZplField(truncateLabelText(
    product.labelTitle?.trim() || product.shortDescription?.trim() || product.description.trim(),
    52,
  ));
  const barcode = escapeZplField(barcodeSource.replace(/\s/g, ''));
  const batch = escapeZplField(batchCode);
  const country = product.countryOfOrigin?.trim() || 'China';
  const madeIn = escapeZplField(country.toLowerCase().startsWith('made in') ? country : `Made in ${country}`);
  const importer = productImporterLabelValue(product).split('\n').map((line) => line.trim()).filter(Boolean);
  const importerName = escapeZplField(truncateLabelText(importer[0] || 'Yreb b.v.', 32));
  const importerAddress = escapeZplField(truncateLabelText(importer.slice(1).join(', '), 54));
  const recycleCodes = normalizePackagingLayers(product)
    .filter((layer) => !isStickerPackagingLayer(layer))
    .map((layer) => layer.recycleCode?.trim() || recycleCodeParts(layer)?.family || '')
    .filter(Boolean)
    .slice(0, 2)
    .join(' / ');
  const recycleLine = recycleCodes ? `Materiaal: ${escapeZplField(recycleCodes)}` : '';

  return `^XA
^CI28
^PW${layout.width}
^LL${layout.height}
^LH0,0
^FO14,12^A0N,28,26^FB330,1,0,L,0^FH\\^FD${code}^FS
^FO14,46^A0N,19,18^FB365,2,2,L,0^FH\\^FD${description}^FS
^FO14,96^BY2,2,58^BCN,58,Y,N,N^FH\\^FD${barcode}^FS
^FO355,12^A0N,25,23^FB270,1,0,R,0^FDRSO PARTS^FS
^FO414,43^BQN,2,4^FH\\^FDLA,${batch}^FS
^FO355,146^A0N,15,14^FB270,1,0,R,0^FH\\^FDBatch ${batch}^FS
^FO355,165^A0N,14,13^FB270,1,0,R,0^FH\\^FD${madeIn}^FS
^FO355,187^A0N,14,13^FB270,1,0,R,0^FH\\^FD${importerName}^FS
^FO355,205^A0N,12,11^FB270,2,1,R,0^FH\\^FD${importerAddress}^FS
${recycleLine ? `^FO14,${size === '80x42' ? 302 : 260}^A0N,13,12^FB340,1,0,L,0^FH\\^FD${recycleLine}^FS` : ''}
^PQ1,0,1,N
^XZ`;
}

export function loadLabelImage(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Een afbeelding voor het Zebra-label kon niet worden geladen.'));
    image.src = source;
  });
}

export function drawContainedImage(
  context: CanvasRenderingContext2D,
  image: CanvasImageSource & { width: number; height: number },
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const scale = Math.min(width / image.width, height / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  context.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
}

export function canvasToZplGraphic(canvas: HTMLCanvasElement) {
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Zebra-label kon niet naar printerdata worden omgezet.');
  const { width, height } = canvas;
  const pixels = context.getImageData(0, 0, width, height).data;
  const bytesPerRow = Math.ceil(width / 8);
  let hex = '';

  for (let y = 0; y < height; y += 1) {
    for (let byteIndex = 0; byteIndex < bytesPerRow; byteIndex += 1) {
      let byte = 0;
      for (let bit = 0; bit < 8; bit += 1) {
        const x = byteIndex * 8 + bit;
        if (x >= width) continue;
        const offset = (y * width + x) * 4;
        const luminance = pixels[offset] * 0.299 + pixels[offset + 1] * 0.587 + pixels[offset + 2] * 0.114;
        if (pixels[offset + 3] > 32 && luminance < 170) byte |= 1 << (7 - bit);
      }
      hex += byte.toString(16).padStart(2, '0').toUpperCase();
    }
  }

  const totalBytes = bytesPerRow * height;
  return `^GFA,${totalBytes},${totalBytes},${bytesPerRow},${hex}`;
}

export async function buildZebraProductLabelRasterZpl(product: Product, size: ZebraProductLabelSize, quantityPerPackage?: number) {
  const layout = zebraRasterLayout(size);
  const barcodeSource = product.barcode?.trim() || product.code.trim();
  const batchCode = product.batchNumber?.trim() || product.batch?.trim() || product.traceabilityCode?.trim();
  if (!barcodeSource) throw new Error('Product heeft geen barcode of code om te printen.');
  if (!batchCode) throw new Error('Product heeft geen batchcode om als QR-code te printen.');

  const canvas = document.createElement('canvas');
  canvas.width = layout.rasterWidth;
  canvas.height = layout.rasterHeight;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Zebra-label kon niet worden opgebouwd.');
  context.scale(layout.rasterWidth / layout.width, layout.rasterHeight / layout.height);
  context.imageSmoothingEnabled = false;
  context.fillStyle = '#fff';
  context.fillRect(0, 0, layout.width, layout.height);
  context.fillStyle = '#000';
  context.textBaseline = 'top';

  const barcodeCanvas = document.createElement('canvas');
  (bwipjs as unknown as { toCanvas: (canvas: HTMLCanvasElement, options: Record<string, unknown>) => HTMLCanvasElement }).toCanvas(barcodeCanvas, {
    bcid: 'code128',
    text: barcodeSource.replace(/\s/g, ''),
    scaleX: 3,
    scaleY: 3,
    height: 13,
    includetext: true,
    textxalign: 'center',
    textsize: 10,
    backgroundcolor: 'FFFFFF',
    barcolor: '000000',
    textcolor: '000000',
  });
  const qrCanvas = document.createElement('canvas');
  (bwipjs as unknown as { toCanvas: (canvas: HTMLCanvasElement, options: Record<string, unknown>) => HTMLCanvasElement }).toCanvas(qrCanvas, {
    bcid: 'qrcode',
    text: batchCode,
    scale: 5,
    padding: 0,
    backgroundcolor: 'FFFFFF',
    barcolor: '000000',
  });

  const logo = await loadLabelImage(rsoLogoUrl);
  const materialIconsBase64 = await buildMaterialIconsBase64(product, 'horizontal');
  const materialIcons = materialIconsBase64
    ? await loadLabelImage(`data:image/png;base64,${materialIconsBase64}`)
    : null;
  const compact = size === '80x36';

  context.font = '700 36px Arial';
  context.fillText(product.code.trim() || barcodeSource, 18, 16, 300);
  const description = truncateLabelText(
    product.labelTitle?.trim() || product.shortDescription?.trim() || product.description.trim(),
    90,
  );
  let descriptionFontSize = 19;
  do {
    context.font = `${descriptionFontSize}px Arial`;
    if (context.measureText(description).width <= 604 || descriptionFontSize <= 12) break;
    descriptionFontSize -= 1;
  } while (descriptionFontSize > 12);
  context.fillText(description, 18, 82, 604);
  drawContainedImage(context, barcodeCanvas, 18, 108, 350, compact ? 105 : 112);
  drawContainedImage(context, logo, 420, 12, 185, 50);
  if (quantityPerPackage && quantityPerPackage > 1) {
    context.textAlign = 'center';
    context.font = '700 22px Arial';
    context.fillText(`Aantal ${quantityPerPackage}`, 500, 68, 190);
    context.textAlign = 'left';
  }
  drawContainedImage(context, qrCanvas, 498, compact ? 182 : 216, 78, 78);

  const country = product.countryOfOrigin?.trim() || 'China';
  const madeIn = country.toLowerCase().startsWith('made in') ? country : `Made in ${country}`;
  context.textAlign = 'center';
  context.font = '13px Arial';
  context.fillText(`Batch ${batchCode}`, 537, compact ? 262 : 300, 115);
  context.save();
  context.translate(600, compact ? 272 : 320);
  context.rotate(-Math.PI / 2);
  context.textAlign = 'left';
  context.font = '700 19px Arial';
  context.fillText(madeIn, 0, 0, compact ? 105 : 120);
  context.restore();

  const importer = productImporterLabelValue(product).split('\n').map((line) => line.trim()).filter(Boolean);
  context.textAlign = 'left';
  context.font = compact ? '14px Arial' : '15px Arial';
  const importerX = 18;
  const importerY = compact ? 214 : 236;
  importer.slice(0, compact ? 3 : 4).forEach((line, index) => {
    context.fillText(truncateLabelText(line, 35), importerX, importerY + index * (compact ? 17 : 18), 255);
  });

  if (materialIcons) {
    drawContainedImage(context, materialIcons, 324, compact ? 207 : 224, 170, compact ? 78 : 92);
  }

  return {
    dataUrl: canvas.toDataURL('image/png'),
    zpl: `^XA
^PW${layout.rasterWidth}
^LL${layout.rasterHeight}
^LH0,0
^FO0,0${canvasToZplGraphic(canvas)}^FS
^PQ1,0,1,N
^XZ`,
  };
}

export function escapeLabelValue(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export async function imageUrlToBase64(url: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('RSO logo kon niet worden geladen voor het productlabel.');
  }
  const blob = await response.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? '');
      resolve(result.includes(',') ? result.split(',')[1] : result);
    };
    reader.onerror = () => reject(new Error('RSO logo kon niet worden verwerkt voor het productlabel.'));
    reader.readAsDataURL(blob);
  });
}

export function recycleCodeParts(layer: ProductPackagingLayer, fallbackMaterial?: string) {
  const recycleCode = layer.recycleCode?.trim();
  const option = findPackagingMaterialOption(layer.material || fallbackMaterial);
  const fallbackParts = recycleCode?.match(/^([A-Za-z]+)\s*([0-9]+)?/);
  if (!option && !fallbackParts) return null;

  return {
    family: option?.recycleFamily || fallbackParts?.[1]?.toUpperCase() || '',
    number: option?.recycleNumber || fallbackParts?.[2] || '',
  };
}

export function svgToPngBase64(svg: string, width: number, height: number) {
  return new Promise<string>((resolve, reject) => {
    const image = new Image();
    const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    image.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        if (!context) {
          reject(new Error('Materiaal icoon kon niet worden gemaakt voor het productlabel.'));
          return;
        }
        context.clearRect(0, 0, width, height);
        context.drawImage(image, 0, 0, width, height);
        URL.revokeObjectURL(url);
        const dataUrl = canvas.toDataURL('image/png');
        resolve(dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl);
      } catch (error) {
        URL.revokeObjectURL(url);
        reject(error);
      }
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Materiaal icoon kon niet worden geladen voor het productlabel.'));
    };
    image.src = url;
  });
}

export async function buildMaterialIconsBase64(product: Product, direction: 'vertical' | 'horizontal' = 'vertical') {
  const iconParts = normalizePackagingLayers(product)
    .filter((item) => !isStickerPackagingLayer(item))
    .filter((item) => item.recycleCode?.trim() || item.material?.trim())
    .slice(0, 2)
    .map((layer) => recycleCodeParts(layer))
    .filter((part): part is { family: string; number: string } => !!part);
  if (!iconParts.length) return null;
  const iconWidth = 112;
  const iconHeight = 126;
  const gap = 14;
  const horizontal = direction === 'horizontal';
  const width = horizontal
    ? iconParts.length * iconWidth + Math.max(0, iconParts.length - 1) * gap
    : iconWidth;
  const height = horizontal
    ? iconHeight
    : iconParts.length * iconHeight + Math.max(0, iconParts.length - 1) * gap;
  const icons = iconParts.map((part, index) => {
    const x = horizontal ? index * (iconWidth + gap) : 0;
    const y = horizontal ? 0 : index * (iconHeight + gap);
    return `<g transform="translate(${x} ${y})">
      <svg x="0" y="0" width="${iconWidth}" height="${iconHeight}" viewBox="0 0 100 112">
        <g fill="none" stroke="#000" stroke-width="7" stroke-linejoin="round" stroke-linecap="butt">
          <path d="M31.63 31.5 44.78 9.57s5.29-5.12 9.92-.49l12.25 20.78" />
          <path d="M45.95 70 20.38 69.57S13.31 67.55 15 61.23l11.87-21" />
          <path d="M72.13 38.35 84.54 60.7s1.79 7.14-4.53 8.83l-24.12.23" />
        </g>
        <g fill="#000">
          <path d="m46.05 69.82 14.67-8.64v17.01z" />
          <path d="m17.25 40.27 14.67-8.64v17.01z" />
          <path d="m57.28 29.99 14.67-8.64v17.01z" />
        </g>
        <text x="50" y="54" text-anchor="middle" font-family="Arial, sans-serif" font-size="20" font-weight="700" fill="#000">${escapeLabelValue(part.number)}</text>
        <text x="50" y="98" text-anchor="middle" font-family="Arial, sans-serif" font-size="15" font-weight="800" fill="#000">${escapeLabelValue(part.family)}</text>
      </svg>
    </g>`;
  }).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${icons}</svg>`;
  return svgToPngBase64(svg, width, height);
}

export function buildProductBarcodeBase64(value: string) {
  const barcodeValue = value.replace(/\s/g, '');
  if (!barcodeValue) return null;
  const canvas = document.createElement('canvas');
  (bwipjs as unknown as { toCanvas: (canvas: HTMLCanvasElement, options: Record<string, unknown>) => HTMLCanvasElement }).toCanvas(canvas, {
    bcid: 'code128',
    text: barcodeValue,
    scaleX: 3,
    scaleY: 3,
    height: 15,
    includetext: true,
    textxalign: 'center',
    textsize: 12,
    textyalign: 'below',
    textyoffset: -4,
    backgroundcolor: 'FFFFFF',
    barcolor: '000000',
    textcolor: '000000',
  });
  const dataUrl = canvas.toDataURL('image/png');
  return dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
}

export function buildOuterBoxBarcodeBase64(value: string) {
  const barcodeValue = value.replace(/\s/g, '');
  if (!barcodeValue) return null;
  const canvas = document.createElement('canvas');
  (bwipjs as unknown as { toCanvas: (canvas: HTMLCanvasElement, options: Record<string, unknown>) => HTMLCanvasElement }).toCanvas(canvas, {
    bcid: 'code128',
    text: barcodeValue,
    scaleX: 4,
    scaleY: 4,
    height: 16,
    includetext: true,
    textxalign: 'center',
    textsize: 10,
    textyalign: 'below',
    textyoffset: -2,
    paddingwidth: 0,
    paddingheight: 0,
    backgroundcolor: 'FFFFFF',
    barcolor: '000000',
    textcolor: '000000',
  });
  const dataUrl = canvas.toDataURL('image/png');
  return dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
}

export function buildScooterBarcodeDataUrl(value: string) {
  const barcodeValue = value.replace(/\s/g, '');
  if (!barcodeValue) return '';
  const canvas = document.createElement('canvas');
  (bwipjs as unknown as { toCanvas: (canvas: HTMLCanvasElement, options: Record<string, unknown>) => HTMLCanvasElement }).toCanvas(canvas, {
    bcid: 'code128',
    text: barcodeValue,
    scaleX: 2,
    scaleY: 2,
    height: 10,
    includetext: true,
    textxalign: 'center',
    textsize: 10,
    textyalign: 'below',
    textyoffset: -2,
    backgroundcolor: 'FFFFFF',
    barcolor: '000000',
    textcolor: '000000',
  });
  return canvas.toDataURL('image/png');
}

export function buildDymoScooterLabelXml(scooter: Scooter, dealer?: Dealer, identifier: 'frame' | 'engine' = 'frame') {
  const identifierValue = identifier === 'engine' ? scooter.engineNumber : scooter.frameNumber;
  const barcodeValue = escapeLabelValue(identifierValue);
  const frameLabel = escapeLabelValue(identifierValue);
  const dealerLine = dealer?.company || scooter.color || '';
  const dealerAddressLine = [
    dealer?.address?.trim() || '',
    [dealer?.Postalcode?.trim() || '', dealer?.city?.trim() || ''].filter(Boolean).join(' '),
  ]
    .filter(Boolean)
    .join(', ');

  const detailLines = [
    scooter.licensePlate?.trim() || 'Geen kenteken',
    `${scooter.model} - ${scooter.color || '-'}`,
    dealerLine,
    dealerAddressLine,
  ]
    .filter(Boolean)
    .join('\n');
  const escapedDetails = escapeLabelValue(detailLines);

  return `<?xml version="1.0" encoding="utf-8"?>
<DieCutLabel Version="8.0" Units="twips">
  <PaperOrientation>Landscape</PaperOrientation>
  <Id>${dymo99012Layout.id}</Id>
  <PaperName>${dymo99012Layout.paperName}</PaperName>
  <DrawCommands>
    <RoundRectangle X="0" Y="0" Width="${dymo99012Layout.width}" Height="${dymo99012Layout.height}" Rx="180" Ry="180" />
  </DrawCommands>
  <ObjectInfo>
    <BarcodeObject>
      <Name>FrameBarcode</Name>
      <ForeColor Alpha="255" Red="0" Green="0" Blue="0" />
      <BackColor Alpha="0" Red="255" Green="255" Blue="255" />
      <LinkedObjectName />
      <Rotation>Rotation0</Rotation>
      <IsMirrored>False</IsMirrored>
      <IsVariable>True</IsVariable>
      <Text>${barcodeValue}</Text>
      <Type>Code128Auto</Type>
      <Size>Small</Size>
      <TextPosition>None</TextPosition>
      <TextFont Family="Arial" Size="8" Bold="False" Italic="False" Underline="False" Strikeout="False" />
      <CheckSumFont Family="Arial" Size="8" Bold="False" Italic="False" Underline="False" Strikeout="False" />
      <TextEmbedding>None</TextEmbedding>
      <ECLevel>0</ECLevel>
      <HorizontalAlignment>Center</HorizontalAlignment>
      <QuietZonesPadding Left="0" Top="0" Right="0" Bottom="0" />
    </BarcodeObject>
    <Bounds X="${dymo99012Layout.barcodeBounds.x}" Y="${dymo99012Layout.barcodeBounds.y}" Width="${dymo99012Layout.barcodeBounds.width}" Height="${dymo99012Layout.barcodeBounds.height}" />
  </ObjectInfo>
  <ObjectInfo>
    <TextObject>
      <Name>FrameNumber</Name>
      <ForeColor Alpha="255" Red="0" Green="0" Blue="0" />
      <BackColor Alpha="0" Red="255" Green="255" Blue="255" />
      <LinkedObjectName />
      <Rotation>Rotation0</Rotation>
      <IsMirrored>False</IsMirrored>
      <IsVariable>True</IsVariable>
      <HorizontalAlignment>Center</HorizontalAlignment>
      <VerticalAlignment>Top</VerticalAlignment>
      <TextFitMode>ShrinkToFit</TextFitMode>
      <UseFullFontHeight>False</UseFullFontHeight>
      <Verticalized>False</Verticalized>
      <StyledText>
        <Element>
          <String>${frameLabel}</String>
          <Attributes>
            <Font Family="Arial" Size="12" Bold="True" Italic="False" Underline="False" Strikeout="False" />
            <ForeColor Alpha="255" Red="0" Green="0" Blue="0" />
          </Attributes>
        </Element>
      </StyledText>
    </TextObject>
    <Bounds X="${dymo99012Layout.frameBounds.x}" Y="${dymo99012Layout.frameBounds.y}" Width="${dymo99012Layout.frameBounds.width}" Height="${dymo99012Layout.frameBounds.height}" />
  </ObjectInfo>
  <ObjectInfo>
    <TextObject>
      <Name>Details</Name>
      <ForeColor Alpha="255" Red="0" Green="0" Blue="0" />
      <BackColor Alpha="0" Red="255" Green="255" Blue="255" />
      <LinkedObjectName />
      <Rotation>Rotation0</Rotation>
      <IsMirrored>False</IsMirrored>
      <IsVariable>True</IsVariable>
      <HorizontalAlignment>Left</HorizontalAlignment>
      <VerticalAlignment>Top</VerticalAlignment>
      <TextFitMode>ShrinkToFit</TextFitMode>
      <UseFullFontHeight>False</UseFullFontHeight>
      <Verticalized>False</Verticalized>
      <StyledText>
        <Element>
          <String>${escapedDetails}</String>
          <Attributes>
            <Font Family="Arial" Size="9" Bold="True" Italic="False" Underline="False" Strikeout="False" />
            <ForeColor Alpha="255" Red="0" Green="0" Blue="0" />
          </Attributes>
        </Element>
      </StyledText>
    </TextObject>
    <Bounds X="${dymo99012Layout.detailsBounds.x}" Y="${dymo99012Layout.detailsBounds.y}" Width="${dymo99012Layout.detailsBounds.width}" Height="${dymo99012Layout.detailsBounds.height}" />
  </ObjectInfo>
</DieCutLabel>`;
}

export function productImporterLabelValue(product: Product) {
  const importerLines = [
    product.importerName,
    product.importerAddress,
    [product.importerPostalCode, product.importerCity].filter(Boolean).join(' '),
    product.importerCountry,
    product.importerEmail || product.importerWebsite,
  ]
    .map((line) => line?.trim())
    .filter(Boolean);

  if (importerLines.length) {
    return importerLines.join('\n');
  }

  return 'Yreb b.v.\nHoekerstraat 12A\n3133KR Vlaardingen\nInfo@rso-parts.nl';
}

export function buildDymoProductLabelXml(product: Product, logoBase64: string, materialIconsBase64: string | null, barcodeBase64: string | null, quantityPerPackage?: number) {
  const barcodeSource = product.barcode?.trim() || product.code.trim();
  if (!barcodeSource) {
    throw new Error('Product heeft geen barcode of code om te printen.');
  }

  const batchCode = product.batchNumber?.trim() || product.batch?.trim() || product.traceabilityCode?.trim();
  if (!batchCode) {
    throw new Error('Product heeft geen batchcode om als QR-code te printen.');
  }

  const country = product.countryOfOrigin?.trim() || 'China';
  const madeInLine = country.toLowerCase().startsWith('made in') ? country : `Made in ${country}`;
  const escapedBarcode = escapeLabelValue(barcodeSource);
  const escapedCode = escapeLabelValue(product.code.trim() || barcodeSource);
  const escapedDescription = escapeLabelValue(product.labelTitle?.trim() || product.shortDescription?.trim() || product.description.trim());
  const escapedBatchCode = escapeLabelValue(batchCode);
  const escapedMadeInLine = escapeLabelValue(madeInLine);
  const escapedImporterInfo = escapeLabelValue(productImporterLabelValue(product));
  const escapedLogoBase64 = escapeLabelValue(logoBase64);
  const escapedMaterialIconsBase64 = materialIconsBase64 ? escapeLabelValue(materialIconsBase64) : '';
  const escapedBarcodeBase64 = barcodeBase64 ? escapeLabelValue(barcodeBase64) : '';
  const textObject = ({
    name,
    value,
    x,
    y,
    width,
    height,
    size,
    bold = false,
    alignment = 'Left',
  }: {
    name: string;
    value: string;
    x: number;
    y: number;
    width: number;
    height: number;
    size: number;
    bold?: boolean;
    alignment?: 'Left' | 'Center' | 'Right';
  }) => `<ObjectInfo>
    <TextObject>
      <Name>${name}</Name>
      <ForeColor Alpha="255" Red="0" Green="0" Blue="0" />
      <BackColor Alpha="0" Red="255" Green="255" Blue="255" />
      <LinkedObjectName />
      <Rotation>Rotation0</Rotation>
      <IsMirrored>False</IsMirrored>
      <IsVariable>True</IsVariable>
      <HorizontalAlignment>${alignment}</HorizontalAlignment>
      <VerticalAlignment>Top</VerticalAlignment>
      <TextFitMode>ShrinkToFit</TextFitMode>
      <UseFullFontHeight>False</UseFullFontHeight>
      <Verticalized>False</Verticalized>
      <StyledText>
        <Element>
          <String>${value}</String>
          <Attributes>
            <Font Family="Arial" Size="${size}" Bold="${bold ? 'True' : 'False'}" Italic="False" Underline="False" Strikeout="False" />
            <ForeColor Alpha="255" Red="0" Green="0" Blue="0" />
          </Attributes>
        </Element>
      </StyledText>
    </TextObject>
    <Bounds X="${x}" Y="${y}" Width="${width}" Height="${height}" />
  </ObjectInfo>`;
  const barcodeObject = barcodeBase64 ? `<ObjectInfo>
    <ImageObject>
      <Name>ProductBarcode</Name>
      <ForeColor Alpha="255" Red="0" Green="0" Blue="0" />
      <BackColor Alpha="0" Red="255" Green="255" Blue="255" />
      <LinkedObjectName />
      <Rotation>Rotation0</Rotation>
      <IsMirrored>False</IsMirrored>
      <IsVariable>False</IsVariable>
      <Image>${escapedBarcodeBase64}</Image>
      <ScaleMode>Uniform</ScaleMode>
      <BorderWidth>0</BorderWidth>
      <BorderColor Alpha="255" Red="0" Green="0" Blue="0" />
      <HorizontalAlignment>Center</HorizontalAlignment>
      <VerticalAlignment>Middle</VerticalAlignment>
    </ImageObject>
    <Bounds X="220" Y="965" Width="1900" Height="900" />
  </ObjectInfo>` : `<ObjectInfo>
    <BarcodeObject>
      <Name>ProductBarcode</Name>
      <ForeColor Alpha="255" Red="0" Green="0" Blue="0" />
      <BackColor Alpha="0" Red="255" Green="255" Blue="255" />
      <LinkedObjectName />
      <Rotation>Rotation0</Rotation>
      <IsMirrored>False</IsMirrored>
      <IsVariable>True</IsVariable>
      <Text>${escapedBarcode}</Text>
      <Type>Code128Auto</Type>
      <Size>Large</Size>
      <TextPosition>Bottom</TextPosition>
      <TextFont Family="Arial" Size="8" Bold="False" Italic="False" Underline="False" Strikeout="False" />
      <CheckSumFont Family="Arial" Size="8" Bold="False" Italic="False" Underline="False" Strikeout="False" />
      <TextEmbedding>None</TextEmbedding>
      <ECLevel>0</ECLevel>
      <HorizontalAlignment>Center</HorizontalAlignment>
      <QuietZonesPadding Left="160" Top="0" Right="160" Bottom="0" />
    </BarcodeObject>
    <Bounds X="220" Y="930" Width="1980" Height="760" />
  </ObjectInfo>`;
  const materialIconsObject = materialIconsBase64 ? `<ObjectInfo>
    <ImageObject>
      <Name>MaterialIcons</Name>
      <ForeColor Alpha="255" Red="0" Green="0" Blue="0" />
      <BackColor Alpha="0" Red="255" Green="255" Blue="255" />
      <LinkedObjectName />
      <Rotation>Rotation0</Rotation>
      <IsMirrored>False</IsMirrored>
      <IsVariable>False</IsVariable>
      <Image>${escapedMaterialIconsBase64}</Image>
      <ScaleMode>Uniform</ScaleMode>
      <BorderWidth>0</BorderWidth>
      <BorderColor Alpha="255" Red="0" Green="0" Blue="0" />
      <HorizontalAlignment>Center</HorizontalAlignment>
      <VerticalAlignment>Middle</VerticalAlignment>
    </ImageObject>
    <Bounds X="3440" Y="790" Width="775" Height="1075" />
  </ObjectInfo>` : '';

  return `<?xml version="1.0" encoding="utf-8"?>
<DieCutLabel Version="8.0" Units="twips">
  <PaperOrientation>Landscape</PaperOrientation>
  <Id>${dymo99012Layout.id}</Id>
  <PaperName>${dymo99012Layout.paperName}</PaperName>
  <DrawCommands>
    <RoundRectangle X="0" Y="0" Width="${dymo99012Layout.width}" Height="${dymo99012Layout.height}" Rx="180" Ry="180" />
  </DrawCommands>
  ${textObject({ name: 'ProductCode', value: escapedCode, x: 220, y: 210, width: 1800, height: 300, size: 14 })}
  ${textObject({ name: 'ProductDescription', value: escapedDescription, x: 220, y: 540, width: 2700, height: 290, size: 10 })}
  ${quantityPerPackage && quantityPerPackage > 1 ? textObject({ name: 'PackageQuantity', value: `Aantal ${quantityPerPackage}`, x: 3380, y: 590, width: 1420, height: 240, size: 12, bold: true, alignment: 'Center' }) : ''}
  <ObjectInfo>
    <ImageObject>
      <Name>RsoLogo</Name>
      <ForeColor Alpha="255" Red="0" Green="0" Blue="0" />
      <BackColor Alpha="0" Red="255" Green="255" Blue="255" />
      <LinkedObjectName />
      <Rotation>Rotation0</Rotation>
      <IsMirrored>False</IsMirrored>
      <IsVariable>False</IsVariable>
      <Image>${escapedLogoBase64}</Image>
      <ScaleMode>Uniform</ScaleMode>
      <BorderWidth>0</BorderWidth>
      <BorderColor Alpha="255" Red="0" Green="0" Blue="0" />
      <HorizontalAlignment>Center</HorizontalAlignment>
      <VerticalAlignment>Middle</VerticalAlignment>
    </ImageObject>
    <Bounds X="3380" Y="150" Width="1420" Height="420" />
  </ObjectInfo>
  ${textObject({ name: 'ImporterInfo', value: escapedImporterInfo, x: 2360, y: 1190, width: 980, height: 520, size: 6 })}
  ${materialIconsObject}
  ${textObject({ name: 'BatchText', value: `Batch ${escapedBatchCode}`, x: 4070, y: 1600, width: 820, height: 180, size: 6, alignment: 'Center' })}
  ${textObject({ name: 'MadeInText', value: escapedMadeInLine, x: 4070, y: 1810, width: 820, height: 140, size: 6, alignment: 'Center' })}
  ${barcodeObject}
  <ObjectInfo>
    <BarcodeObject>
      <Name>BatchQrCode</Name>
      <ForeColor Alpha="255" Red="0" Green="0" Blue="0" />
      <BackColor Alpha="0" Red="255" Green="255" Blue="255" />
      <LinkedObjectName />
      <Rotation>Rotation0</Rotation>
      <IsMirrored>False</IsMirrored>
      <IsVariable>True</IsVariable>
      <Text>${escapedBatchCode}</Text>
      <Type>QRCode</Type>
      <Size>Medium</Size>
      <TextPosition>None</TextPosition>
      <TextFont Family="Arial" Size="8" Bold="False" Italic="False" Underline="False" Strikeout="False" />
      <CheckSumFont Family="Arial" Size="8" Bold="False" Italic="False" Underline="False" Strikeout="False" />
      <TextEmbedding>None</TextEmbedding>
      <ECLevel>0</ECLevel>
      <HorizontalAlignment>Center</HorizontalAlignment>
      <QuietZonesPadding Left="0" Top="0" Right="0" Bottom="0" />
    </BarcodeObject>
    <Bounds X="4200" Y="900" Width="620" Height="660" />
  </ObjectInfo>
</DieCutLabel>`;
}

export function buildDymoOuterBoxLabelXml({
  articleNumber,
  description,
  barcodeValue,
  batchCode,
  quantity,
  responsibleParty,
  countryOfOrigin,
}: {
  articleNumber: string;
  description: string;
  barcodeValue: string;
  batchCode: string;
  quantity: string;
  responsibleParty: string;
  countryOfOrigin: string;
}) {
  const escapedArticleNumber = escapeLabelValue(articleNumber);
  const escapedDescription = escapeLabelValue(description);
  const escapedBatchCode = escapeLabelValue(batchCode);
  const escapedQuantity = escapeLabelValue(quantity);
  const escapedBarcode = escapeLabelValue(barcodeValue);
  const escapedResponsibleParty = escapeLabelValue(responsibleParty);
  const escapedOrigin = escapeLabelValue(countryOfOrigin.toLowerCase().startsWith('made in') ? countryOfOrigin : `Made in ${countryOfOrigin}`);
  const barcodeBase64 = buildOuterBoxBarcodeBase64(barcodeValue);

  const textObject = ({
    name,
    value,
    x,
    y,
    width,
    height,
    size,
    bold = false,
    alignment = 'Left',
  }: {
    name: string;
    value: string;
    x: number;
    y: number;
    width: number;
    height: number;
    size: number;
    bold?: boolean;
    alignment?: 'Left' | 'Center' | 'Right';
  }) => `<ObjectInfo>
    <TextObject>
      <Name>${name}</Name>
      <ForeColor Alpha="255" Red="0" Green="0" Blue="0" />
      <BackColor Alpha="0" Red="255" Green="255" Blue="255" />
      <LinkedObjectName />
      <Rotation>Rotation0</Rotation>
      <IsMirrored>False</IsMirrored>
      <IsVariable>True</IsVariable>
      <HorizontalAlignment>${alignment}</HorizontalAlignment>
      <VerticalAlignment>Top</VerticalAlignment>
      <TextFitMode>ShrinkToFit</TextFitMode>
      <UseFullFontHeight>False</UseFullFontHeight>
      <Verticalized>False</Verticalized>
      <StyledText>
        <Element>
          <String>${value}</String>
          <Attributes>
            <Font Family="Arial" Size="${size}" Bold="${bold ? 'True' : 'False'}" Italic="False" Underline="False" Strikeout="False" />
            <ForeColor Alpha="255" Red="0" Green="0" Blue="0" />
          </Attributes>
        </Element>
      </StyledText>
    </TextObject>
    <Bounds X="${x}" Y="${y}" Width="${width}" Height="${height}" />
  </ObjectInfo>`;

  const barcodeObject = barcodeBase64 ? `<ObjectInfo>
    <ImageObject>
      <Name>OuterBoxBarcode</Name>
      <ForeColor Alpha="255" Red="0" Green="0" Blue="0" />
      <BackColor Alpha="0" Red="255" Green="255" Blue="255" />
      <LinkedObjectName />
      <Rotation>Rotation0</Rotation>
      <IsMirrored>False</IsMirrored>
      <IsVariable>False</IsVariable>
      <Image>${escapeLabelValue(barcodeBase64)}</Image>
      <ScaleMode>Uniform</ScaleMode>
      <BorderWidth>0</BorderWidth>
      <BorderColor Alpha="255" Red="0" Green="0" Blue="0" />
      <HorizontalAlignment>Center</HorizontalAlignment>
      <VerticalAlignment>Middle</VerticalAlignment>
    </ImageObject>
    <Bounds X="2450" Y="650" Width="2220" Height="1190" />
  </ObjectInfo>` : `<ObjectInfo>
    <BarcodeObject>
      <Name>OuterBoxBarcode</Name>
      <ForeColor Alpha="255" Red="0" Green="0" Blue="0" />
      <BackColor Alpha="0" Red="255" Green="255" Blue="255" />
      <LinkedObjectName />
      <Rotation>Rotation0</Rotation>
      <IsMirrored>False</IsMirrored>
      <IsVariable>True</IsVariable>
      <Text>${escapedBarcode}</Text>
      <Type>Code128Auto</Type>
      <Size>Large</Size>
      <TextPosition>Bottom</TextPosition>
      <TextFont Family="Arial" Size="8" Bold="False" Italic="False" Underline="False" Strikeout="False" />
      <CheckSumFont Family="Arial" Size="8" Bold="False" Italic="False" Underline="False" Strikeout="False" />
      <TextEmbedding>None</TextEmbedding>
      <ECLevel>0</ECLevel>
      <HorizontalAlignment>Center</HorizontalAlignment>
      <QuietZonesPadding Left="0" Top="0" Right="0" Bottom="0" />
    </BarcodeObject>
    <Bounds X="2450" Y="650" Width="2220" Height="1080" />
  </ObjectInfo>`;

  return `<?xml version="1.0" encoding="utf-8"?>
<DieCutLabel Version="8.0" Units="twips">
  <PaperOrientation>Landscape</PaperOrientation>
  <Id>${dymo99012Layout.id}</Id>
  <PaperName>${dymo99012Layout.paperName}</PaperName>
  <DrawCommands>
    <RoundRectangle X="0" Y="0" Width="${dymo99012Layout.width}" Height="${dymo99012Layout.height}" Rx="180" Ry="180" />
  </DrawCommands>
  ${textObject({ name: 'ArticleValue', value: escapedArticleNumber, x: 220, y: 130, width: 2200, height: 260, size: 16, bold: true })}
  ${textObject({ name: 'DescriptionValue', value: escapedDescription, x: 220, y: 410, width: 2050, height: 390, size: 14, bold: true })}
  ${textObject({ name: 'ResponsibleParty', value: escapedResponsibleParty, x: 220, y: 820, width: 2050, height: 760, size: 6 })}
  ${textObject({ name: 'Origin', value: escapedOrigin, x: 220, y: 1600, width: 1100, height: 140, size: 6, bold: true })}
  ${barcodeObject}
  ${textObject({ name: 'QuantityLabel', value: 'Aantal', x: 2450, y: 100, width: 2220, height: 130, size: 8, bold: true, alignment: 'Center' })}
  ${textObject({ name: 'QuantityValue', value: escapedQuantity, x: 2450, y: 240, width: 2220, height: 300, size: 18, bold: true, alignment: 'Center' })}
  ${textObject({ name: 'BatchLabel', value: 'Batch', x: 260, y: 1180, width: 1900, height: 140, size: 8, bold: true })}
  ${textObject({ name: 'BatchValue', value: escapedBatchCode, x: 260, y: 1330, width: 1900, height: 340, size: 18, bold: true })}
</DieCutLabel>`;
}

export async function getAvailableDymoPrinter() {
  const hosts = ['localhost', '127.0.0.1'];
  const ports = Array.from({ length: 10 }, (_, index) => 41951 + index);
  const failedEndpoints: string[] = [];

  for (const hostname of hosts) {
    for (const port of ports) {
      const dymo = new Dymo({ hostname, port });
      const result = await dymo.getPrinters();
      if (!result.success) {
        failedEndpoints.push(`${hostname}:${port}`);
        continue;
      }
      const printers = result.data as DymoBrowserPrinter[];
      const printer = printers.find((item) => item.connected && item.name.includes('LabelWriter 450'))
        ?? printers.find((item) => item.connected && item.name.includes('LabelWriter'))
        ?? printers.find((item) => item.connected)
        ?? printers.find((item) => item.name);
      if (printer?.name) {
        return { dymo, printerName: printer.name, port };
      }
      failedEndpoints.push(`${hostname}:${port} zonder printer`);
    }
  }

  throw new Error(`Geen actieve DYMO Connect webservice of LabelWriter printer gevonden. Getest: ${failedEndpoints.slice(0, 6).join(', ')}.`);
}

export async function printScooterDymoLabel(scooter: Scooter, dealer?: Dealer, identifier: 'frame' | 'engine' = 'frame') {
  const identifierValue = identifier === 'engine' ? scooter.engineNumber : scooter.frameNumber;
  if (!identifierValue?.trim()) {
    throw new Error(identifier === 'engine' ? 'Motornummer ontbreekt.' : 'Framenummer ontbreekt.');
  }
  const { dymo, printerName } = await getAvailableDymoPrinter();
  const labelXml = buildDymoScooterLabelXml(scooter, dealer, identifier);
  const labelType = identifier === 'engine' ? 'Motornummer' : 'Framenummer';
  const printResult = await dymo.printLabel(printerName, labelXml, { jobTitle: `${labelType} ${identifierValue}` });
  if (!printResult.success) {
    throw printResult.data instanceof Error ? printResult.data : new Error(String(printResult.data));
  }
  return printerName;
}

export async function printProductDymoLabel(product: Product, quantity = 1, quantityPerPackage?: number) {
  const { dymo, printerName } = await getAvailableDymoPrinter();
  const logoBase64 = await imageUrlToBase64(rsoLogoUrl);
  const materialIconsBase64 = await buildMaterialIconsBase64(product);
  const barcodeBase64 = buildProductBarcodeBase64(product.barcode?.trim() || product.code.trim());
  const labelXml = buildDymoProductLabelXml(product, logoBase64, materialIconsBase64, barcodeBase64, quantityPerPackage);
  for (let index = 0; index < quantity; index += 1) {
    const printResult = await dymo.printLabel(printerName, labelXml, { jobTitle: `Product ${product.code || product.description} (${index + 1}/${quantity})` });
    if (!printResult.success) {
      throw printResult.data instanceof Error ? printResult.data : new Error(String(printResult.data));
    }
  }
  return printerName;
}

export async function getAvailableZebraPrinter() {
  const endpoints = ['http://localhost:9100', 'http://127.0.0.1:9100'];
  const failedEndpoints: string[] = [];

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(`${endpoint}/available`, {
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) {
        failedEndpoints.push(`${endpoint} (${response.status})`);
        continue;
      }
      const result = await response.json() as { printer?: ZebraBrowserPrinter[] };
      const printers = Array.isArray(result.printer) ? result.printer : [];
      const printer = printers.find((item) => /ZD421/i.test(item.name || ''))
        ?? printers.find((item) => /Zebra/i.test(`${item.manufacturer || ''} ${item.name || ''}`))
        ?? printers[0];
      if (printer) {
        return { endpoint, printer };
      }
      failedEndpoints.push(`${endpoint} zonder printer`);
    } catch {
      failedEndpoints.push(endpoint);
    }
  }

  throw new Error(`Geen Zebra ZD421 gevonden. Start Zebra Browser Print en controleer de printerverbinding. Getest: ${failedEndpoints.join(', ')}.`);
}

export async function printProductZebraLabel(product: Product, quantity = 1, size: ZebraProductLabelSize = '80x42', quantityPerPackage?: number) {
  const { endpoint, printer } = await getAvailableZebraPrinter();
  const { zpl } = await buildZebraProductLabelRasterZpl(product, size, quantityPerPackage);

  for (let index = 0; index < quantity; index += 1) {
    const response = await fetch(`${endpoint}/write`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device: printer, data: zpl }),
    });
    if (!response.ok) {
      throw new Error(`Zebra Browser Print gaf fout ${response.status} bij label ${index + 1}.`);
    }
  }

  return `${printer.name || 'Zebra ZD421'} (${zebraProductLabelLayouts[size].label}, ${readZebraPrinterDpi()} DPI)`;
}

export async function previewProductZebraLabel(product: Product, size: ZebraProductLabelSize, quantityPerPackage?: number) {
  const previewWindow = window.open('', '_blank', 'popup,width=920,height=650');
  if (!previewWindow) {
    throw new Error('Het voorbeeldvenster is geblokkeerd. Sta pop-ups voor deze website toe en probeer opnieuw.');
  }

  try {
    const { dataUrl } = await buildZebraProductLabelRasterZpl(product, size, quantityPerPackage);
    const layout = zebraRasterLayout(size);
    previewWindow.document.open();
    previewWindow.document.write(`<!doctype html>
<html lang="nl">
<head>
  <meta charset="utf-8">
  <title>Voorbeeld Zebra-productlabel ${layout.label}</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; padding: 32px; background: #202124; color: #fff; font-family: Arial, sans-serif; }
    header { max-width: 900px; margin: 0 auto 22px; display: flex; align-items: center; justify-content: space-between; gap: 20px; }
    h1 { margin: 0; font-size: 18px; }
    p { margin: 5px 0 0; color: #c7c9cc; font-size: 13px; }
    .sheet { width: min(100%, 900px); margin: 0 auto; padding: 28px; background: #34363a; border-radius: 12px; overflow: auto; }
    img { display: block; width: ${layout.rasterWidth}px; max-width: none; height: ${layout.rasterHeight}px; background: #fff; image-rendering: pixelated; box-shadow: 0 8px 26px rgba(0,0,0,.35); }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>Zebra ZD421 — ${layout.label} liggend · ${layout.dpi} DPI</h1>
      <p>Dit is exact de zwart-witafbeelding die naar de printer wordt gestuurd.</p>
    </div>
  </header>
  <div class="sheet"><img src="${dataUrl}" alt="Voorbeeld productlabel"></div>
</body>
</html>`);
    previewWindow.document.close();
  } catch (error) {
    previewWindow.close();
    throw error;
  }
}

export async function printOuterBoxDymoLabel({
  articleNumber,
  description,
  barcodeValue,
  batchCode,
  quantityPerLabel,
  labelsToPrint,
  responsibleParty,
  countryOfOrigin,
}: {
  articleNumber: string;
  description: string;
  barcodeValue: string;
  batchCode: string;
  quantityPerLabel: number;
  labelsToPrint: number;
  responsibleParty: string;
  countryOfOrigin: string;
}) {
  const { dymo, printerName } = await getAvailableDymoPrinter();
  const labelXml = buildDymoOuterBoxLabelXml({
    articleNumber,
    description,
    barcodeValue,
    batchCode,
    quantity: formatQuantity(quantityPerLabel),
    responsibleParty,
    countryOfOrigin,
  });
  for (let index = 0; index < labelsToPrint; index += 1) {
    const printResult = await dymo.printLabel(printerName, labelXml, { jobTitle: `Omdoos ${articleNumber} (${index + 1}/${labelsToPrint})` });
    if (!printResult.success) {
      throw printResult.data instanceof Error ? printResult.data : new Error(String(printResult.data));
    }
  }
  return printerName;
}

export function openOuterBoxLabelPreview({
  articleNumber,
  description,
  barcodeValue,
  batchCode,
  quantityPerLabel,
  responsibleParty,
  countryOfOrigin,
}: {
  articleNumber: string;
  description: string;
  barcodeValue: string;
  batchCode: string;
  quantityPerLabel: number;
  responsibleParty: string;
  countryOfOrigin: string;
}) {
  const barcodeBase64 = buildOuterBoxBarcodeBase64(barcodeValue);
  const previewWindow = window.open('', '_blank', 'width=1100,height=700');
  if (!previewWindow) {
    throw new Error('Voorbeeldvenster kon niet worden geopend.');
  }

  const articleHtml = escapeLabelValue(articleNumber);
  const descriptionHtml = escapeLabelValue(description);
  const batchHtml = escapeLabelValue(batchCode);
  const quantityHtml = escapeLabelValue(formatQuantity(quantityPerLabel));
  const barcodeHtml = escapeLabelValue(barcodeValue);
  const responsiblePartyHtml = escapeLabelValue(responsibleParty).replace(/\n/g, '<br>');
  const originHtml = escapeLabelValue(countryOfOrigin.toLowerCase().startsWith('made in') ? countryOfOrigin : `Made in ${countryOfOrigin}`);
  const barcodeImage = barcodeBase64 ? `data:image/png;base64,${barcodeBase64}` : '';

  previewWindow.opener = null;
  previewWindow.document.open();
  previewWindow.document.write(`
    <html>
      <head>
        <title>Omdoos sticker voorbeeld</title>
        <style>
          body {
            margin: 0;
            font-family: Arial, sans-serif;
            background: #eef2f6;
            color: #0f172a;
          }
          .preview-shell {
            min-height: 100vh;
            display: grid;
            place-items: center;
            padding: 32px;
            box-sizing: border-box;
          }
          .preview-panel {
            width: min(100%, 1080px);
          }
          .preview-title {
            margin: 0 0 16px;
            font-size: 20px;
            font-weight: 700;
          }
          .preview-note {
            margin: 0 0 20px;
            color: #52606d;
            font-size: 14px;
          }
          .sticker {
            width: 89mm;
            height: 36mm;
            background: #fff;
            border: 2px solid #d6dde5;
            border-radius: 10px;
            box-shadow: 0 18px 40px rgba(15, 23, 42, 0.12);
            padding: 3mm 4mm;
            box-sizing: border-box;
            display: grid;
            grid-template-rows: auto auto 1fr;
            gap: 1.5mm;
          }
          .article-number {
            font-size: 4.6mm;
            font-weight: 700;
            line-height: 1.05;
          }
          .label-caption {
            font-size: 1.8mm;
            font-weight: 700;
            text-transform: uppercase;
            color: #64748b;
            letter-spacing: 0.04em;
          }
          .description {
            max-width: 42mm;
            font-size: 3.6mm;
            font-weight: 700;
            line-height: 1.08;
            overflow: hidden;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
          }
          .responsible-party {
            max-width: 42mm;
            font-size: 1.65mm;
            line-height: 1.2;
            color: #334155;
          }
          .origin {
            margin-top: 0.6mm;
            font-size: 1.7mm;
            font-weight: 700;
          }
          .bottom-row {
            display: grid;
            grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr);
            align-items: center;
            gap: 2mm;
            width: 100%;
          }
          .details-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 1.6mm;
            align-items: center;
          }
          .barcode-column {
            display: grid;
            grid-template-rows: auto 1fr;
            gap: 1mm;
            min-width: 0;
          }
          .quantity-block {
            text-align: center;
          }
          .quantity-block .detail-value {
            margin-top: 0.2mm;
            font-size: 4mm;
          }
          .detail-card {
            border: 1px solid #d7dee6;
            border-radius: 6px;
            padding: 1.4mm 1.8mm;
            min-height: 16mm;
            box-sizing: border-box;
            background: #f8fafc;
          }
          .detail-value {
            margin-top: 0.8mm;
            font-size: 5mm;
            font-weight: 700;
            line-height: 1.1;
            word-break: break-word;
          }
          .barcode-wrap {
            display: flex;
            justify-content: flex-end;
            align-items: end;
            min-width: 0;
            width: 100%;
            min-height: 15mm;
          }
          .barcode-wrap img {
            width: 100%;
            max-width: 100%;
            height: 100%;
            max-height: 15mm;
            object-fit: fill;
            object-position: right bottom;
            display: block;
            image-rendering: crisp-edges;
          }
          .barcode-fallback {
            font-size: 2.1mm;
            font-weight: 700;
            text-align: center;
          }
        </style>
      </head>
      <body>
        <div class="preview-shell">
          <div class="preview-panel">
            <h1 class="preview-title">Omdoos sticker voorbeeld</h1>
            <p class="preview-note">Lokale preview zonder printer. Verhouding is afgestemd op de DYMO-sticker.</p>
            <div class="sticker">
              <div class="article-number">${articleHtml}</div>
              <div>
                <div class="description">${descriptionHtml}</div>
                <div class="responsible-party">${responsiblePartyHtml}</div>
                <div class="origin">${originHtml}</div>
              </div>
              <div class="bottom-row">
                <div class="details-grid">
                  <div class="detail-card">
                    <div class="label-caption">Batch</div>
                    <div class="detail-value">${batchHtml}</div>
                  </div>
                </div>
                <div class="barcode-column">
                  <div class="quantity-block"><div class="label-caption">Aantal</div><div class="detail-value">${quantityHtml}</div></div>
                  <div class="barcode-wrap">
                    ${barcodeImage ? `<img src="${barcodeImage}" alt="Barcode ${barcodeHtml}" />` : `<div class="barcode-fallback">${barcodeHtml}</div>`}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </body>
    </html>
  `);
  previewWindow.document.close();
}
