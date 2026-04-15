'use strict';

const JSZip = require('jszip');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

const OFFICE_EXTENSIONS = new Set(['docx', 'xlsx', 'pptx']);
const BINARY_DOCUMENT_EXTENSIONS = new Set(['docx', 'xlsx', 'pptx', 'pdf']);

function escapeXml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ── Markdown parser ──────────────────────────────────────────────────────────

function parseMd(text) {
  const raw = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  const blocks = [];
  const lines = raw.split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^[-*=]{3,}\s*$/.test(line.trim())) { blocks.push({ type: 'hr' }); i++; continue; }
    const hm = line.match(/^(#{1,6})\s+(.+)/);
    if (hm) { blocks.push({ type: 'heading', level: hm[1].length, text: hm[2].trim() }); i++; continue; }
    if (/^[\*\-\+]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^[\*\-\+]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^[\*\-\+]\s+/, '').trim()); i++;
      }
      blocks.push({ type: 'bullets', items }); continue;
    }
    if (/^\d+[\.\)]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\d+[\.\)]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+[\.\)]\s+/, '').trim()); i++;
      }
      blocks.push({ type: 'numbered', items }); continue;
    }
    // Markdown table — collect all consecutive | lines
    if (/^\|/.test(line)) {
      const tableLines = [];
      while (i < lines.length && /^\|/.test(lines[i])) { tableLines.push(lines[i]); i++; }
      let headers = [];
      let rows = [];
      if (tableLines.length >= 2 && isTableSepRow(tableLines[1])) {
        headers = parseTableRow(tableLines[0]);
        rows = tableLines.slice(2).filter((r) => !isTableSepRow(r)).map(parseTableRow);
      } else {
        rows = tableLines.filter((r) => !isTableSepRow(r)).map(parseTableRow);
      }
      if (headers.length || rows.length) blocks.push({ type: 'table', headers, rows });
      continue;
    }
    if (!line.trim()) { i++; continue; }
    const paraLines = [];
    while (
      i < lines.length && lines[i].trim() &&
      !lines[i].match(/^#{1,6}\s/) &&
      !/^[\*\-\+]\s+/.test(lines[i]) &&
      !/^\d+[\.]\)\s+/.test(lines[i]) &&
      !/^[-*=]{3,}\s*$/.test(lines[i].trim()) &&
      !/^\|/.test(lines[i])
    ) { paraLines.push(lines[i]); i++; }
    if (paraLines.length) blocks.push({ type: 'paragraph', text: paraLines.join(' ') });
  }
  return blocks;
}

function stripInlineMd(text) {
  return String(text || '')
    .replace(/\*\*\*([^*]+)\*\*\*/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .trim();
}

function parseTableRow(line) {
  return line.replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
}

function isTableSepRow(line) {
  // Matches separator rows like | :--- | :---: | ---: |
  return /^\|?\s*:?-{2,}:?(\s*\|\s*:?-{2,}:?)+\s*\|?\s*$/.test(line);
}

// ── DOCX helpers ─────────────────────────────────────────────────────────────

function buildDocxTable({ headers, rows }) {
  const border = 'w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"';
  const tblBorders = `<w:tblBorders><w:top ${border}/><w:left ${border}/><w:bottom ${border}/><w:right ${border}/><w:insideH ${border}/><w:insideV ${border}/></w:tblBorders>`;
  const buildRow = (cells, isHeader) => {
    const cellsXml = cells.map((cell) => {
      const shading = isHeader ? '<w:tcPr><w:shd w:val="clear" w:color="auto" w:fill="1B3A6B"/><w:tcMar><w:top w:w="60" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="60" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tcMar></w:tcPr>' : '<w:tcPr><w:tcMar><w:top w:w="60" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="60" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tcMar></w:tcPr>';
      const runs = isHeader
        ? `<w:r><w:rPr><w:b/><w:color w:val="FFFFFF"/></w:rPr><w:t xml:space="preserve">${escapeXml(stripInlineMd(cell))}</w:t></w:r>`
        : buildWordRuns(cell);
      return `<w:tc>${shading}<w:p>${runs}</w:p></w:tc>`;
    }).join('');
    return `<w:tr>${cellsXml}</w:tr>`;
  };
  const headerXml = headers.length ? buildRow(headers, true) : '';
  const dataXml = rows.map((r) => buildRow(r, false)).join('');
  return `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/>${tblBorders}</w:tblPr>${headerXml}${dataXml}</w:tbl>`;
}

function buildWordRuns(text) {
  const regex = /\*\*\*([^*]+)\*\*\*|\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`|([^*`]+)/g;
  let result = '';
  let match;
  while ((match = regex.exec(String(text || ''))) !== null) {
    if (match[1]) result += `<w:r><w:rPr><w:b/><w:i/></w:rPr><w:t xml:space="preserve">${escapeXml(match[1])}</w:t></w:r>`;
    else if (match[2]) result += `<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">${escapeXml(match[2])}</w:t></w:r>`;
    else if (match[3]) result += `<w:r><w:rPr><w:i/></w:rPr><w:t xml:space="preserve">${escapeXml(match[3])}</w:t></w:r>`;
    else if (match[4]) result += `<w:r><w:rPr><w:rFonts w:ascii="Courier New" w:hAnsi="Courier New"/><w:sz w:val="20"/></w:rPr><w:t xml:space="preserve">${escapeXml(match[4])}</w:t></w:r>`;
    else if (match[5]) result += `<w:r><w:t xml:space="preserve">${escapeXml(match[5])}</w:t></w:r>`;
  }
  return result || '<w:r><w:t></w:t></w:r>';
}

function buildDocxParagraphs(text) {
  const blocks = parseMd(text);
  if (!blocks.length) return '<w:p><w:r><w:t></w:t></w:r></w:p>';
  return blocks.map((block) => {
    if (block.type === 'heading') {
      const sid = block.level <= 3 ? `Heading${block.level}` : 'Heading3';
      return `<w:p><w:pPr><w:pStyle w:val="${sid}"/></w:pPr><w:r><w:t xml:space="preserve">${escapeXml(stripInlineMd(block.text))}</w:t></w:r></w:p>`;
    }
    if (block.type === 'bullets' || block.type === 'numbered') {
      return block.items.map((item, idx) => {
        const bullet = block.type === 'numbered' ? `${idx + 1}. ` : '\u2022 ';
        return `<w:p><w:pPr><w:pStyle w:val="ListParagraph"/></w:pPr><w:r><w:t xml:space="preserve">${escapeXml(bullet + stripInlineMd(item))}</w:t></w:r></w:p>`;
      }).join('');
    }
    if (block.type === 'hr') {
      return '<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="CCCCCC"/></w:pBdr></w:pPr></w:p>';
    }
    if (block.type === 'table') {
      return buildDocxTable(block);
    }
    return `<w:p>${buildWordRuns(block.text)}</w:p>`;
  }).join('');
}

// ── XLSX helpers ─────────────────────────────────────────────────────────────

function parseTableRows(text) {
  const normalized = String(text || '').replace(/\r\n/g, '\n').trim();
  if (!normalized) return [['']];
  return normalized.split('\n').filter(Boolean).map((line) => {
    if (line.includes('\t')) return line.split('\t');
    if (line.includes(',')) return line.split(',');
    return [line];
  });
}

function columnName(index) {
  let current = index + 1; let result = '';
  while (current > 0) {
    const remainder = (current - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    current = Math.floor((current - 1) / 26);
  }
  return result;
}

function buildWorksheetRows(text) {
  return parseTableRows(text).map((cells, rowIndex) => {
    const rowNumber = rowIndex + 1;
    const cellXml = cells.map((cell, cellIndex) => {
      const ref = `${columnName(cellIndex)}${rowNumber}`;
      const value = String(cell ?? '').trim();
      if (/^-?\d+(?:\.\d+)?$/.test(value)) return `<c r="${ref}"><v>${value}</v></c>`;
      return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
    }).join('');
    return `<row r="${rowNumber}">${cellXml}</row>`;
  }).join('');
}

// ── PPTX helpers ─────────────────────────────────────────────────────────────

const PPTX_P_NS = 'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
const PPTX_A_NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"';
const PPTX_R_NS = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const PPTX_NS = `${PPTX_P_NS} ${PPTX_A_NS} ${PPTX_R_NS}`;

function parseSlidesFromMd(text) {
  const blocks = parseMd(text);
  const slides = [];
  let current = null;
  const flush = () => { if (current) slides.push(current); };
  for (const block of blocks) {
    if (block.type === 'heading' && block.level === 1) {
      flush(); current = { title: stripInlineMd(block.text), subtitle: '', bullets: [], type: 'title' };
    } else if (block.type === 'heading' && block.level === 2) {
      flush(); current = { title: stripInlineMd(block.text), bullets: [], type: 'content' };
    } else if (block.type === 'heading' && block.level >= 3) {
      if (!current) current = { title: '', bullets: [], type: 'content' };
      current.bullets.push({ text: stripInlineMd(block.text), bold: true });
    } else if (block.type === 'bullets' || block.type === 'numbered') {
      if (!current) current = { title: '', bullets: [], type: 'content' };
      for (const item of block.items) current.bullets.push({ text: stripInlineMd(item), bold: false });
    } else if (block.type === 'paragraph') {
      if (!current) current = { title: '', bullets: [], type: 'content' };
      if (current.type === 'title' && !current.subtitle) current.subtitle = stripInlineMd(block.text);
      else current.bullets.push({ text: stripInlineMd(block.text), bold: false });
    }
  }
  flush();
  if (!slides.length) slides.push({ title: 'Presentation', bullets: [], type: 'content' });
  return slides;
}

function buildSlideXml(slide) {
  const isTitle = slide.type === 'title';
  const bgColor = isTitle ? '1B2A4A' : 'FFFFFF';
  const titleColor = isTitle ? 'FFFFFF' : '1B2A4A';
  const titleSz = isTitle ? '5400' : '3600';
  const titleY = isTitle ? '2400000' : '320000';
  const contentY = isTitle ? '3400000' : '1380000';
  const contentH = isTitle ? '1800000' : '5200000';

  const titleParas = `<a:p><a:pPr algn="${isTitle ? 'ctr' : 'l'}"/><a:r><a:rPr lang="en-US" sz="${titleSz}" b="1" dirty="0"><a:solidFill><a:srgbClr val="${titleColor}"/></a:solidFill></a:rPr><a:t>${escapeXml(slide.title)}</a:t></a:r></a:p>`;

  let contentParas;
  if (isTitle) {
    contentParas = slide.subtitle
      ? `<a:p><a:pPr algn="ctr"/><a:r><a:rPr lang="en-US" sz="2400" dirty="0"><a:solidFill><a:srgbClr val="A0B4D0"/></a:solidFill></a:rPr><a:t>${escapeXml(slide.subtitle)}</a:t></a:r></a:p>`
      : '<a:p><a:endParaRPr lang="en-US" sz="2400"/></a:p>';
  } else {
    contentParas = slide.bullets.map((b) =>
      `<a:p><a:r><a:rPr lang="en-US" sz="2000"${b.bold ? ' b="1"' : ''} dirty="0"/><a:t>${escapeXml((b.bold ? '\u25aa ' : '\u2022 ') + b.text)}</a:t></a:r></a:p>`
    ).join('') || '<a:p><a:endParaRPr lang="en-US" sz="2000"/></a:p>';
  }

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld ${PPTX_NS}>
  <p:cSld>
    <p:bg><p:bgPr><a:solidFill><a:srgbClr val="${bgColor}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="2" name="Title"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>
        <p:spPr><a:xfrm><a:off x="457200" y="${titleY}"/><a:ext cx="8229600" cy="900000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr>
        <p:txBody><a:bodyPr wrap="square"/><a:lstStyle/>${titleParas}</p:txBody>
      </p:sp>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="3" name="Content"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>
        <p:spPr><a:xfrm><a:off x="457200" y="${contentY}"/><a:ext cx="8229600" cy="${contentH}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr>
        <p:txBody><a:bodyPr wrap="square"/><a:lstStyle/>${contentParas}</p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
</p:sld>`;
}

// ── Buffer builders ───────────────────────────────────────────────────────────

async function createDocxBuffer(text) {
  const zip = new JSZip();
  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/><w:rPr><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/><w:basedOn w:val="Normal"/>
    <w:pPr><w:keepNext/><w:outlineLvl w:val="0"/><w:spacing w:before="240" w:after="120"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="52"/><w:szCs w:val="52"/><w:color w:val="1B3A6B"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading2">
    <w:name w:val="heading 2"/><w:basedOn w:val="Normal"/>
    <w:pPr><w:keepNext/><w:outlineLvl w:val="1"/><w:spacing w:before="200" w:after="80"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="36"/><w:szCs w:val="36"/><w:color w:val="2E74B5"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading3">
    <w:name w:val="heading 3"/><w:basedOn w:val="Normal"/>
    <w:pPr><w:keepNext/><w:outlineLvl w:val="2"/><w:spacing w:before="160" w:after="60"/></w:pPr>
    <w:rPr><w:b/><w:i/><w:sz w:val="28"/><w:szCs w:val="28"/><w:color w:val="5B9BD5"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="ListParagraph">
    <w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/>
    <w:pPr><w:ind w:left="720" w:firstLine="0"/><w:spacing w:after="40"/></w:pPr>
  </w:style>
</w:styles>`;

  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`);
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);
  zip.file('word/styles.xml', stylesXml);
  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>${buildDocxParagraphs(text)}<w:sectPr/></w:body>
</w:document>`);
  zip.file('word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

async function createXlsxBuffer(text) {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`);
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`);
  zip.file('xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets>
</workbook>`);
  zip.file('xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`);
  zip.file('xl/worksheets/sheet1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>${buildWorksheetRows(text)}</sheetData>
</worksheet>`);
  zip.file('xl/styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts><font><sz val="11"/><name val="Calibri"/></font></fonts>
  <fills><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
  <borders><border><left/><right/><top/><bottom/><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>
</styleSheet>`);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

async function createPptxBuffer(text) {
  const zip = new JSZip();
  const slides = parseSlidesFromMd(text);

  const slideContentTypes = slides.map((_, i) =>
    `  <Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`
  ).join('\n');
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>
  <Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>
${slideContentTypes}
</Types>`);

  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>`);

  const sldIdList = slides.map((_, i) => `    <p:sldId id="${256 + i}" r:id="rId${i + 2}"/>`).join('\n');
  zip.file('ppt/presentation.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation ${PPTX_NS}>
  <p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>
  <p:sldIdLst>
${sldIdList}
  </p:sldIdLst>
  <p:sldSz cx="9144000" cy="6858000"/>
  <p:notesSz cx="6858000" cy="9144000"/>
</p:presentation>`);

  const slideRels = slides.map((_, i) =>
    `  <Relationship Id="rId${i + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i + 1}.xml"/>`
  ).join('\n');
  zip.file('ppt/_rels/presentation.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>
${slideRels}
</Relationships>`);

  const slideRelXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
</Relationships>`;
  for (let i = 0; i < slides.length; i++) {
    zip.file(`ppt/slides/slide${i + 1}.xml`, buildSlideXml(slides[i]));
    zip.file(`ppt/slides/_rels/slide${i + 1}.xml.rels`, slideRelXml);
  }

  zip.file('ppt/slideLayouts/slideLayout1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldLayout ${PPTX_NS} type="blank"><p:cSld name="Blank"><p:spTree>
  <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
  <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
</p:spTree></p:cSld></p:sldLayout>`);
  zip.file('ppt/slideLayouts/_rels/slideLayout1.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>
</Relationships>`);
  zip.file('ppt/slideMasters/slideMaster1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldMaster ${PPTX_NS}><p:cSld><p:spTree>
  <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
  <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
</p:spTree></p:cSld>
<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>
</p:sldMaster>`);
  zip.file('ppt/slideMasters/_rels/slideMaster1.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
</Relationships>`);

  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

async function createPdfBuffer(text) {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const marginX = 54;
  const marginTop = 72;
  const marginBottom = 54;
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const maxWidth = pageWidth - marginX * 2;

  let page = pdfDoc.addPage([pageWidth, pageHeight]);
  let cursorY = pageHeight - marginTop;

  const addPage = () => { page = pdfDoc.addPage([pageWidth, pageHeight]); cursorY = pageHeight - marginTop; };

  const wrapLine = (line, f, sz) => {
    const words = String(line || '').split(/\s+/).filter(Boolean);
    if (!words.length) return [''];
    const out = []; let cur = words[0];
    for (let j = 1; j < words.length; j++) {
      const candidate = `${cur} ${words[j]}`;
      if (f.widthOfTextAtSize(candidate, sz) <= maxWidth) cur = candidate;
      else { out.push(cur); cur = words[j]; }
    }
    out.push(cur); return out;
  };

  // Replace characters outside WinAnsi (pdf-lib standard fonts only support WinAnsi)
  const toWinAnsi = (str) => str
    .replace(/[\u2018\u2019]/g, "'")   // smart single quotes → '
    .replace(/[\u201C\u201D]/g, '"')   // smart double quotes → "
    .replace(/\u2013/g, '-')           // en-dash → -
    .replace(/\u2014/g, '--')          // em-dash → --
    .replace(/\u2026/g, '...')         // ellipsis → ...
    .replace(/\u2022/g, '*')           // bullet → *
    .replace(/\u00A0/g, ' ')           // non-breaking space → space
    .replace(/[^\x00-\xFF]/g, '');     // remove any remaining non-latin chars

  const drawText = (line, f, sz, color, indent = 0) => {
    for (const w of wrapLine(toWinAnsi(line), f, sz)) {
      if (cursorY <= marginBottom) addPage();
      page.drawText(w, { x: marginX + indent, y: cursorY, size: sz, font: f, color });
      cursorY -= sz * 1.4;
    }
  };

  for (const block of parseMd(text)) {
    if (block.type === 'heading') {
      const sz = [22, 18, 15, 13][Math.min(block.level - 1, 3)];
      cursorY -= 6;
      drawText(stripInlineMd(block.text), boldFont, sz, rgb(0.1, 0.2, 0.4));
      cursorY -= 4;
    } else if (block.type === 'paragraph') {
      drawText(stripInlineMd(block.text), font, 11, rgb(0.12, 0.12, 0.14));
      cursorY -= 6;
    } else if (block.type === 'bullets' || block.type === 'numbered') {
      for (let idx = 0; idx < block.items.length; idx++) {
        const bullet = block.type === 'numbered' ? `${idx + 1}. ` : '\u2022 ';
        drawText(bullet + stripInlineMd(block.items[idx]), font, 11, rgb(0.12, 0.12, 0.14), 14);
      }
      cursorY -= 6;
    } else if (block.type === 'hr') {
      cursorY -= 6;
      if (cursorY > marginBottom) page.drawLine({ start: { x: marginX, y: cursorY }, end: { x: pageWidth - marginX, y: cursorY }, thickness: 0.5, color: rgb(0.7, 0.7, 0.7) });
      cursorY -= 10;
    } else if (block.type === 'table') {
      const allRows = block.headers.length ? [block.headers, ...block.rows] : block.rows;
      if (!allRows.length) continue;
      const colCount = Math.max(...allRows.map((r) => r.length));
      if (!colCount) continue;
      const colWidth = maxWidth / colCount;
      const rowH = 18;
      const padX = 5;
      const padY = 4;
      for (let ri = 0; ri < allRows.length; ri++) {
        if (cursorY - rowH <= marginBottom) addPage();
        const rowY = cursorY - rowH;
        const isHeader = block.headers.length && ri === 0;
        if (isHeader) {
          page.drawRectangle({ x: marginX, y: rowY, width: maxWidth, height: rowH, color: rgb(0.1, 0.23, 0.42) });
        } else if (ri % 2 === 0) {
          page.drawRectangle({ x: marginX, y: rowY, width: maxWidth, height: rowH, color: rgb(0.96, 0.96, 0.98) });
        }
        // Horizontal lines
        page.drawLine({ start: { x: marginX, y: cursorY }, end: { x: marginX + maxWidth, y: cursorY }, thickness: 0.5, color: rgb(0.75, 0.75, 0.75) });
        // Vertical lines
        for (let ci = 0; ci <= colCount; ci++) {
          page.drawLine({ start: { x: marginX + ci * colWidth, y: cursorY }, end: { x: marginX + ci * colWidth, y: rowY }, thickness: 0.5, color: rgb(0.75, 0.75, 0.75) });
        }
        const cells = allRows[ri];
        const textColor = isHeader ? rgb(1, 1, 1) : rgb(0.12, 0.12, 0.14);
        const f = isHeader ? boldFont : font;
        for (let ci = 0; ci < colCount; ci++) {
          let cellText = toWinAnsi(stripInlineMd(cells[ci] || ''));
          const cellX = marginX + ci * colWidth + padX;
          const maxCellW = colWidth - padX * 2;
          while (cellText.length > 1 && f.widthOfTextAtSize(cellText, 9) > maxCellW) {
            cellText = cellText.slice(0, -1);
          }
          page.drawText(cellText, { x: cellX, y: rowY + padY, size: 9, font: f, color: textColor });
        }
        cursorY = rowY;
      }
      // Bottom border of table
      page.drawLine({ start: { x: marginX, y: cursorY }, end: { x: marginX + maxWidth, y: cursorY }, thickness: 0.5, color: rgb(0.75, 0.75, 0.75) });
      cursorY -= 10;
    }
  }

  return Buffer.from(await pdfDoc.save());
}

// ── Text extraction ───────────────────────────────────────────────────────────

function decodeXmlText(xml = '') {
  return String(xml || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/\s+/g, ' ').trim();
}

async function extractDocxText(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const xml = await zip.file('word/document.xml')?.async('string');
  if (!xml) return '';
  return decodeXmlText(
    xml.replace(/<w:tab\/?\s*>/g, '\t').replace(/<w:br\/?\s*>/g, '\n').replace(/<\/w:p>/g, '\n\n')
  );
}

async function extractPptxText(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const slideFiles = Object.keys(zip.files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const slides = [];
  for (let i = 0; i < slideFiles.length; i++) {
    const xml = await zip.file(slideFiles[i])?.async('string');
    if (!xml) continue;
    const txt = decodeXmlText([...xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((m) => m[1]).join('\n'));
    if (txt) slides.push(`Slide ${i + 1}\n${txt}`);
  }
  return slides.join('\n\n');
}

async function extractXlsxText(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const sharedStringsXml = await zip.file('xl/sharedStrings.xml')?.async('string');
  const sharedStrings = sharedStringsXml
    ? [...sharedStringsXml.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => decodeXmlText(m[1]))
    : [];
  const sheetFiles = Object.keys(zip.files)
    .filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const sheets = [];
  for (let i = 0; i < sheetFiles.length; i++) {
    const xml = await zip.file(sheetFiles[i])?.async('string');
    if (!xml) continue;
    const rows = [...xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)].map((rm) => {
      const cells = [...rm[1].matchAll(/<c([^>]*)>([\s\S]*?)<\/c>/g)].map((cm) => {
        const attrs = cm[1] || ''; const body = cm[2] || '';
        if (/t="s"/.test(attrs)) return sharedStrings[Number((body.match(/<v>(\d+)<\/v>/) || [])[1])] || '';
        const is = body.match(/<t[^>]*>([\s\S]*?)<\/t>/);
        if (is) return decodeXmlText(is[1]);
        const v = body.match(/<v>([\s\S]*?)<\/v>/);
        return decodeXmlText(v?.[1] || '');
      }).filter(Boolean);
      return cells.join('\t');
    }).filter(Boolean);
    if (rows.length) sheets.push(`Sheet ${i + 1}\n${rows.join('\n')}`);
  }
  return sheets.join('\n\n');
}

async function extractOfficeDocumentText(ext, buffer) {
  switch (ext) {
    case 'docx': return extractDocxText(buffer);
    case 'pptx': return extractPptxText(buffer);
    case 'xlsx': return extractXlsxText(buffer);
    default: return '';
  }
}

async function createOfficeDocumentBuffer(ext, content) {
  switch (ext) {
    case 'docx': return createDocxBuffer(content);
    case 'xlsx': return createXlsxBuffer(content);
    case 'pptx': return createPptxBuffer(content);
    case 'pdf': return createPdfBuffer(content);
    default: throw new Error(`Unsupported Office format: ${ext}`);
  }
}

function isOfficeDocumentPath(rel = '') {
  const ext = String(rel).split('.').pop()?.toLowerCase();
  return BINARY_DOCUMENT_EXTENSIONS.has(ext);
}

module.exports = {
  createOfficeDocumentBuffer,
  extractOfficeDocumentText,
  isOfficeDocumentPath,
  OFFICE_EXTENSIONS,
  BINARY_DOCUMENT_EXTENSIONS,
};
