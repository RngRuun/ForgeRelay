"""Package the committed source and Windows portable update without personal data."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess
import zipfile

root = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--executable', type=Path, required=True)
parser.add_argument('--output', type=Path, required=True)
args = parser.parse_args()
version = json.loads((root / 'package.json').read_text(encoding='utf-8'))['version']
if not re.fullmatch(r'\d+\.\d+\.\d+', version):
    raise SystemExit('Invalid release version')
def git(*arguments):
    return subprocess.check_output(['git', '-C', str(root), *arguments])
if git('status', '--porcelain').strip():
    raise SystemExit('Commit the reviewed source before packaging a release')
commit = git('rev-parse', 'HEAD').decode().strip()
files = git('ls-files', '-z').decode().split('\0')
output = args.output.resolve()
output.mkdir(parents=True, exist_ok=True)
def digest(data):
    return hashlib.sha256(data).hexdigest()
exe = args.executable.resolve()
exe_bytes = exe.read_bytes()
if len(exe_bytes) < 1_000_000 or not exe_bytes.startswith(b'MZ'):
    raise SystemExit('Expected a complete Windows portable executable')
payload = {
    'ForgeRelay.exe': exe_bytes,
    'Update-ForgeRelay.ps1': (root / 'desktop/update/Update-ForgeRelay.ps1').read_bytes(),
    'Update-ForgeRelay.cmd': (root / 'desktop/update/Update-ForgeRelay.cmd').read_bytes(),
    'CHANGELOG.md': (root / 'CHANGELOG.md').read_bytes(),
    'README.txt': f'''ForgeRelay {version} · Windows x64 免安装版

首次使用：解压后双击 ForgeRelay.exe。无需安装 Node.js 或浏览器。
同目录保留 ForgeRelay.config.json；默认数据与加密凭据在 %APPDATA%/ForgeRelay。

从 0.6.1 / 0.6.2 升级：先从托盘退出旧版；将本包解压到临时文件夹，
双击 Update-ForgeRelay.cmd，选择原来的应用文件夹。更新器验证文件、备份旧程序，
兼容旧版本文件名及原快捷方式，失败自动回滚；不覆盖配置、会话、附件或项目。

已经使用固定 ForgeRelay.exe 的版本：退出应用后，可以直接将本包文件覆盖到原目录。
也可以继续使用更新器。不要在旧版本仍运行时强行替换 exe。

源码包需要 Node.js 22.19+；打开应用.cmd 首次联网准备锁定依赖并打开桌面。
模型执行仍需自己的供应商接入；更新不会自动启动推理。

修复说明见 CHANGELOG.md 和 Release 附带的报告；SHA256SUMS.txt 用于核对下载完整性。
'''.encode('utf-8-sig')
}
manifest = {'product': 'ForgeRelay', 'version': version, 'architecture': 'x64', 'sourceCommit': commit,
            'files': [{'path': name, 'bytes': len(data), 'sha256': digest(data)} for name, data in payload.items()]}
payload['release-manifest.json'] = json.dumps(manifest, ensure_ascii=False, indent=2).encode('utf-8')
source_records = []
forbidden = re.compile(r'(^|/)(\.git|node_modules|data|outputs|runtime|\.codex-remote-attachments)(/|$)|(^|/)(\.env(\..*)?|ForgeRelay\.config\.json|auth\.json|deepseek-key\.encrypted)$|\.(pem|key|pfx)$', re.I)
source_zip = output / f'ForgeRelay-{version}-source.zip'
portable_zip = output / f'ForgeRelay-{version}-Windows-x64-portable.zip'
for target in [source_zip, portable_zip]:
    if target.exists(): raise SystemExit(f'Refusing to overwrite an already packaged release: {target}')
with zipfile.ZipFile(source_zip, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for name in sorted(filter(None, files)):
        if forbidden.search(name): raise SystemExit(f'Private or generated source input: {name}')
        file = root / name
        if file.is_symlink(): raise SystemExit(f'Unexpected source symlink: {name}')
        data = file.read_bytes()
        if re.search(rb'sk-[a-zA-Z0-9_-]{28,}', data): raise SystemExit(f'Secret-like value in {name}')
        # Git stores text scripts with LF; cmd.exe delivery requires CRLF.
        if name.endswith('.cmd'): data = data.replace(b'\r\n', b'\n').replace(b'\n', b'\r\n')
        archive.writestr(f'ForgeRelay-{version}-source/{name}', data)
        source_records.append({'path': name, 'bytes': len(data), 'sha256': digest(data)})
    archive.writestr(f'ForgeRelay-{version}-source/SOURCE-MANIFEST.json', json.dumps({'version': version, 'commit': commit, 'files': source_records}, ensure_ascii=False, indent=2))
with zipfile.ZipFile(portable_zip, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
    for name, data in payload.items(): archive.writestr(name, data)
for target in [source_zip, portable_zip]:
    with zipfile.ZipFile(target) as archive:
        if archive.testzip() is not None: raise SystemExit(f'ZIP integrity check failed: {target.name}')
checks = [{'name': file.name, 'bytes': file.stat().st_size, 'sha256': digest(file.read_bytes())} for file in [source_zip, portable_zip]]
(output / 'SHA256SUMS.txt').write_text(''.join(f'{entry["sha256"]}  {entry["name"]}\n' for entry in checks), encoding='ascii')
result = {'version': version, 'commit': commit, 'sourceFiles': len(source_records), 'userDataIncluded': False, 'executableSha256': digest(exe_bytes), 'stableExecutable': 'ForgeRelay.exe', 'archives': checks}
(output / 'package-validation.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(result, ensure_ascii=False))
