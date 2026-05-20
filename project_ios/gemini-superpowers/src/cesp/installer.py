import json
import os
import tarfile
import urllib.request
import tempfile
import shutil

REGISTRY_URL = "https://peonping.github.io/registry/index.json"

def fetch_registry():
    try:
        with urllib.request.urlopen(REGISTRY_URL) as response:
            data = json.loads(response.read().decode())
            if isinstance(data, dict):
                return data.get("packs", [])
            return data
    except Exception as e:
        print(f"Error fetching registry: {e}")
        return []

def install_pack(pack_name: str, packs_dir: str):
    registry = fetch_registry()
    pack_info = next((p for p in registry if p["name"] == pack_name), None)
    
    if not pack_info:
        print(f"Pack '{pack_name}' not found in registry.")
        return False

    repo = pack_info["source_repo"]
    ref = pack_info["source_ref"]
    path = pack_info["source_path"]
    
    tarball_url = f"https://github.com/{repo}/archive/refs/tags/{ref}.tar.gz"
    
    print(f"Downloading {pack_name} from {tarball_url}...")
    
    try:
        with tempfile.TemporaryDirectory() as tmp_dir:
            tarball_path = os.path.join(tmp_dir, "pack.tar.gz")
            urllib.request.urlretrieve(tarball_url, tarball_path)
            
            with tarfile.open(tarball_path, "r:gz") as tar:
                tar.extractall(path=tmp_dir)
            
            # The extracted directory name is usually {repo_name}-{ref_without_v}
            # or similar. We need to find the one that contains the path.
            extracted_root = next(d for d in os.listdir(tmp_dir) 
                                 if os.path.isdir(os.path.join(tmp_dir, d)) and d != "pack.tar.gz")
            
            source_full_path = os.path.join(tmp_dir, extracted_root, path)
            target_path = os.path.join(os.path.expanduser(packs_dir), pack_name)
            
            if os.path.exists(target_path):
                shutil.rmtree(target_path)
            
            shutil.copytree(source_full_path, target_path)
            print(f"Successfully installed '{pack_name}' to {target_path}")
            return True
            
    except Exception as e:
        print(f"Error installing pack: {e}")
        return False
