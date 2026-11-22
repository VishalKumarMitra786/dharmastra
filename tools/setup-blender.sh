#!/usr/bin/env bash
# Installs Blender as a Python module (bpy) into /tmp/bl, outside the repo. About 430 MB download.
# Use it as: /tmp/bl/bin/python your_script.py   (headless, no display needed)
# Blender is GPL; the models, textures and animations we export with it are ours.
set -e
[ -x /tmp/bl/bin/python ] && /tmp/bl/bin/python -c "import bpy" 2>/dev/null && { echo "bpy already installed"; exit 0; }
python3 -m venv /tmp/bl
pip download bpy --no-deps -d /tmp/bpytest -q
/tmp/bl/bin/pip install -q /tmp/bpytest/bpy-*.whl
/tmp/bl/bin/python -c "import bpy; print('Blender', bpy.app.version_string)"
