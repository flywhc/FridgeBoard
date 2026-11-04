"""执行真实 GitHub 发布 shell，验证 Ad Hoc 元数据及摘要门禁。"""

import hashlib
import json
import os
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]


@pytest.mark.parametrize("method", ["ad-hoc", "development", "enterprise"])
@pytest.mark.parametrize("bad_digest", [False, True])
def test_workflow_publishes_adhoc_label_and_checks_digest(
    tmp_path: Path, method: str, bad_digest: bool,
) -> None:
    """只有 Ad Hoc 使用更新标签，所有方式均须通过摘要门禁。"""
    workflow = (ROOT / ".github/workflows/ios-release.yml").read_text()
    step = workflow.split("      - name: Publish IPA to GitHub Release\n", 1)[1]
    shell = "\n".join(line[10:] for line in step.split("        run: |\n", 1)[1].splitlines())
    artifact_dir = tmp_path / "output/mobile-release"
    artifact_dir.mkdir(parents=True)
    artifact = artifact_dir / "FridgeBoard-0.2.11-ios.ipa"
    artifact.write_bytes(b"signed IPA fixture")
    digest = hashlib.sha256(artifact.read_bytes()).hexdigest()
    arguments_file = tmp_path / "arguments.json"
    fake_gh = tmp_path / "gh"
    fake_gh.write_text(
        "#!/usr/bin/env python3\n"
        "import json, os, sys\n"
        "from pathlib import Path\n"
        "if sys.argv[1:3] == ['release', 'upload']:\n"
        "    Path(os.environ['ARGUMENTS_FILE']).write_text(json.dumps(sys.argv[3:]))\n"
        "if sys.argv[1] == 'api':\n"
        "    print(os.environ['ASSET_DIGEST'])\n"
    )
    fake_gh.chmod(0o700)
    result = subprocess.run(
        ["bash", "-c", shell], cwd=tmp_path, capture_output=True, text=True, timeout=10,
        env={
            **os.environ, "PATH": f"{tmp_path}:{os.environ['PATH']}",
            "APP_VERSION": "0.2.11", "GITHUB_SHA": "commit", "GH_REPO": "flywhc/FridgeBoard",
            "IOS_EXPORT_METHOD": method, "IOS_BUILD_NUMBER": "4", "IOS_RELEASE": "261104173345",
            "ARGUMENTS_FILE": str(arguments_file),
            "ASSET_DIGEST": "sha256:invalid" if bad_digest else f"sha256:{digest}",
        },
    )
    assert (result.returncode != 0) is bad_digest, result.stderr
    arguments = json.loads(arguments_file.read_text())
    expected_label = (
        "AdHoc build=4 release=261104173345" if method == "ad-hoc" else f"iOS {method}"
    )
    assert arguments == [
        "v0.2.11",
        f"output/mobile-release/FridgeBoard-0.2.11-ios.ipa#{expected_label}",
        "--clobber",
    ]
