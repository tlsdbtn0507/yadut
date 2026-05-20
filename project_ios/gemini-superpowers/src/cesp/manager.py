import json
import os
import random
import time
from typing import Optional, List, Dict
from .audio import play_sound

class CESPManager:
    def __init__(self, packs_dir: str):
        self.packs_dir = os.path.expanduser(packs_dir)
        self.active_pack_name: Optional[str] = None
        self.last_played: Dict[str, str] = {}  # category -> last file_path
        self.last_event_time: Dict[str, float] = {}  # category -> timestamp
        self.volume = 0.5
        self.muted = False
        self.disabled_categories: List[str] = []
        
        # Ensure packs dir exists
        if not os.path.exists(self.packs_dir):
            os.makedirs(self.packs_dir)

    def set_active_pack(self, pack_name: str):
        self.active_pack_name = pack_name

    def set_volume(self, volume: float):
        self.volume = max(0.0, min(1.0, volume))

    def set_muted(self, muted: bool):
        self.muted = muted

    def toggle_category(self, category: str, enabled: bool):
        if enabled and category in self.disabled_categories:
            self.disabled_categories.remove(category)
        elif not enabled and category not in self.disabled_categories:
            self.disabled_categories.append(category)

    def get_installed_packs(self) -> List[str]:
        if not os.path.exists(self.packs_dir):
            return []
        return [d for d in os.listdir(self.packs_dir) 
                if os.path.isdir(os.path.join(self.packs_dir, d)) 
                and os.path.exists(os.path.join(self.packs_dir, d, "openpeon.json"))]

    def _load_manifest(self, pack_name: str) -> Optional[dict]:
        manifest_path = os.path.join(self.packs_dir, pack_name, "openpeon.json")
        if not os.path.exists(manifest_path):
            return None
        try:
            with open(manifest_path, 'r') as f:
                return json.load(f)
        except Exception:
            return None

    def emit(self, category: str):
        """
        Emits a CESP event, playing a sound if available and not debounced.
        """
        if self.muted or category in self.disabled_categories or not self.active_pack_name:
            return

        # Debounce: skip if < 500ms since last sound in same category
        now = time.time()
        if now - self.last_event_time.get(category, 0) < 0.5:
            return

        manifest = self._load_manifest(self.active_pack_name)
        if not manifest:
            return

        # Lookup order: categories[category] -> category_aliases[category]
        sounds_info = manifest.get("categories", {}).get(category)
        if not sounds_info:
            alias = manifest.get("category_aliases", {}).get(category)
            if alias:
                sounds_info = manifest.get("categories", {}).get(alias)

        if not sounds_info or not sounds_info.get("sounds"):
            return

        sounds = sounds_info["sounds"]
        candidates = [s for s in sounds if s.get("file")]
        
        if not candidates:
            return

        # No-repeat logic: exclude last played if > 1 sound available
        last_file = self.last_played.get(category)
        if len(candidates) > 1 and last_file:
            candidates = [s for s in candidates if s["file"] != last_file]

        selected_sound = random.choice(candidates)
        file_name = selected_sound["file"]
        
        # Path resolution: relative to manifest, handle missing 'sounds/' prefix
        pack_path = os.path.join(self.packs_dir, self.active_pack_name)
        if "/" not in file_name:
            file_path = os.path.join(pack_path, "sounds", file_name)
        else:
            file_path = os.path.join(pack_path, file_name)

        # Normalize path separators
        file_path = os.path.abspath(file_path)

        play_sound(file_path, self.volume)
        
        self.last_played[category] = file_name
        self.last_event_time[category] = now
