# -*- mode: python ; coding: utf-8 -*-

from pathlib import Path
import sys

from PyInstaller.utils.hooks import collect_data_files, collect_submodules


backend_root = Path(SPECPATH).parent / "backend"
sys.path.insert(0, str(backend_root))
hiddenimports = collect_submodules("app") + collect_submodules("uvicorn")
datas = (
    collect_data_files("pydantic")
    + collect_data_files("reportlab")
    + collect_data_files("openpyxl")
)

analysis = Analysis(
    [str(backend_root / "app" / "desktop_entry.py")],
    pathex=[str(backend_root)],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=["pytest", "mypy", "ruff"],
    noarchive=False,
)
pyz = PYZ(analysis.pure)

executable = EXE(
    pyz,
    analysis.scripts,
    [],
    exclude_binaries=True,
    name="bidevidence-backend",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=True,
)

collection = COLLECT(
    executable,
    analysis.binaries,
    analysis.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name="bidevidence-backend",
)
