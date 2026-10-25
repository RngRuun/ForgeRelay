import sys, json, zipfile, pathlib, xml.etree.ElementTree as ET
sys.stdout.reconfigure(encoding='utf-8')
file = pathlib.Path(sys.argv[1])
parts = []
limit = 120000
if file.suffix.lower() == '.pdf':
    try:
        from pypdf import PdfReader
    except ImportError:
        print(json.dumps({'supported': False, 'text': 'PDF 文本解析需要 pypdf；可运行 python -m pip install pypdf。扫描件需要另外的 OCR。'}, ensure_ascii=False))
        sys.exit(0)
    reader = PdfReader(str(file))
    for index, page in enumerate(reader.pages[:100]):
        parts.append(f'\n--- Page {index+1} ---\n' + (page.extract_text() or '[本页没有可提取的文字，可能需要 OCR]'))
        if sum(map(len, parts)) > limit:
            break
elif zipfile.is_zipfile(file):
    with zipfile.ZipFile(file) as z:
        infos = z.infolist()
        if sum(i.file_size for i in infos) > 100 * 1024 * 1024 or len(infos) > 10000:
            raise ValueError('解压后内容超过解析上限')
        names = [i.filename for i in infos]
        ext = file.suffix.lower()
        targets = (['word/document.xml'] if ext == '.docx' else
                   sorted(n for n in names if n.startswith('ppt/slides/slide') and n.endswith('.xml')) if ext == '.pptx' else
                   sorted(n for n in names if n.startswith('xl/worksheets/sheet') and n.endswith('.xml')) if ext == '.xlsx' else ['content.xml'])
        shared = []
        if ext == '.xlsx' and 'xl/sharedStrings.xml' in names:
            shared = [''.join(n.itertext()) for n in ET.fromstring(z.read('xl/sharedStrings.xml'))]
        for name in targets[:100]:
            if name not in names:
                continue
            tree = ET.fromstring(z.read(name))
            if ext == '.xlsx':
                rows = []
                for row in tree.iter('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}row'):
                    cells = []
                    for cell in row:
                        value = ''.join(cell.itertext())
                        if cell.get('t') == 's' and value.isdigit() and int(value) < len(shared):
                            value = shared[int(value)]
                        cells.append(f'{cell.get("r", "")}={value}')
                    rows.append(' | '.join(cells))
                    if len(rows) >= 1000:
                        break
                content = '\n'.join(rows)
            else:
                content = '\n'.join(n.text for n in tree.iter() if n.text and n.text.strip())
            parts.append(f'\n--- {name} ---\n' + content)
            if sum(map(len, parts)) > limit:
                break
else:
    raise ValueError('此文档格式没有内置解码器')
text = '\n'.join(parts)
print(json.dumps({'supported': True, 'text': text[:limit], 'truncated': len(text) > limit, 'note': '文本提取，不执行宏或嵌入代码。图表、样式与扫描图片不属于已理解的内容。'}, ensure_ascii=False))
