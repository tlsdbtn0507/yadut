import sys
import os
import argparse
import json
from .manager import CESPManager
from .installer import install_pack, fetch_registry

DEFAULT_PACKS_DIR = os.path.expanduser("~/.gemini/packs")
CONFIG_FILE = os.path.expanduser("~/.gemini/cesp_config.json")

def load_config():
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, 'r') as f:
                return json.load(f)
        except:
            pass
    return {"active_pack": None, "volume": 0.5, "muted": False}

def save_config(config):
    os.makedirs(os.path.dirname(CONFIG_FILE), exist_ok=True)
    with open(CONFIG_FILE, 'w') as f:
        json.dump(config, f)

def main():
    parser = argparse.ArgumentParser(description="CESP Sound Pack Manager")
    subparsers = parser.add_subparsers(dest="command")

    # list
    subparsers.add_parser("list", help="List installed sound packs")

    # search
    subparsers.add_parser("search", help="Search available sound packs in registry")

    # install
    install_parser = subparsers.add_parser("install", help="Install a sound pack")
    install_parser.add_argument("name", help="Name of the pack to install")

    # use
    use_parser = subparsers.add_parser("use", help="Set the active sound pack")
    use_parser.add_argument("name", help="Name of the pack to use")

    # volume
    vol_parser = subparsers.add_parser("volume", help="Set the master volume (0.0 - 1.0)")
    vol_parser.add_argument("level", type=float, help="Volume level")

    # emit
    emit_parser = subparsers.add_parser("emit", help="Emit an event (for testing or hooks)")
    emit_parser.add_argument("category", help="Category name (e.g., session.start)")

    args = parser.parse_args()
    
    config = load_config()
    manager = CESPManager(DEFAULT_PACKS_DIR)
    manager.active_pack_name = config.get("active_pack")
    manager.volume = config.get("volume", 0.5)
    manager.muted = config.get("muted", False)

    if args.command == "list":
        packs = manager.get_installed_packs()
        if not packs:
            print("No sound packs installed.")
        else:
            print("Installed sound packs:")
            for p in packs:
                prefix = "*" if p == manager.active_pack_name else " "
                print(f"{prefix} {p}")

    elif args.command == "search":
        registry = fetch_registry()
        print(f"{'Name':<15} {'Sounds':<8} {'Size':<10} {'Categories'}")
        print("-" * 60)
        for p in registry:
            cats = ", ".join(p.get("categories", [])[:3])
            if len(p.get("categories", [])) > 3: cats += "..."
            size = p.get("total_size_bytes", 0) / 1024 / 1024
            print(f"{p.get('name', 'N/A'):<15} {p.get('sound_count', 0):<8} {size:>.1f}MB   {cats}")

    elif args.command == "install":
        if install_pack(args.name, DEFAULT_PACKS_DIR):
            if not manager.active_pack_name:
                config["active_pack"] = args.name
                save_config(config)

    elif args.command == "use":
        packs = manager.get_installed_packs()
        if args.name in packs:
            config["active_pack"] = args.name
            save_config(config)
            print(f"Now using pack: {args.name}")
        else:
            print(f"Pack '{args.name}' is not installed.")

    elif args.command == "volume":
        config["volume"] = max(0.0, min(1.0, args.level))
        save_config(config)
        print(f"Volume set to {config['volume']}")

    elif args.command == "emit":
        manager.emit(args.category)

    else:
        parser.print_help()

if __name__ == "__main__":
    main()
