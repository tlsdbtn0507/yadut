import subprocess
import os
import platform
import shutil

def play_sound(file_path, volume=1.0):
    """
    Plays a sound file asynchronously and cross-platform.
    """
    if not os.path.exists(file_path):
        return

    system = platform.system()
    
    try:
        if system == "Darwin":  # macOS
            # afplay -v [0-1.0] (actually it can go higher, but 1.0 is standard)
            subprocess.Popen(["nohup", "afplay", "-v", str(volume), file_path], 
                             stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, 
                             preexec_fn=os.setpgrp)
        
        elif system == "Linux":
            # Try PipeWire, PulseAudio, FFmpeg, mpv, SoX, ALSA
            if shutil.which("pw-play"):
                subprocess.Popen(["pw-play", f"--volume={volume}", file_path], 
                                 stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            elif shutil.which("paplay"):
                # PulseAudio uses 0-65536
                pa_volume = int(volume * 65536)
                subprocess.Popen(["paplay", f"--volume={pa_volume}", file_path], 
                                 stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            elif shutil.which("ffplay"):
                # ffplay uses 0-100
                ff_volume = int(volume * 100)
                subprocess.Popen(["ffplay", "-nodisp", "-autoexit", "-volume", str(ff_volume), file_path], 
                                 stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            elif shutil.which("mpv"):
                # mpv uses 0-100
                mpv_volume = int(volume * 100)
                subprocess.Popen(["mpv", "--no-terminal", f"--volume={mpv_volume}", file_path], 
                                 stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            elif shutil.which("play"):  # SoX
                subprocess.Popen(["play", "-v", str(volume), file_path], 
                                 stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            elif shutil.which("aplay"):  # ALSA (no volume control)
                subprocess.Popen(["aplay", file_path], 
                                 stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                
        elif system == "Windows":
            # PowerShell MediaPlayer
            ps_command = f"""
            $player = New-Object System.Windows.Media.MediaPlayer
            $player.Open([Uri]::new((Resolve-Path "{file_path}")))
            $player.Volume = {volume}
            $player.Play()
            Start-Sleep -Seconds 10 # Wait for it to play (it's async in PS, but we need to keep process alive long enough)
            """
            subprocess.Popen(["powershell", "-Command", ps_command], 
                             stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                             
    except Exception:
        # Silently fail as per CESP requirement
        pass
