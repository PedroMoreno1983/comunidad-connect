import paramiko
import os
import sys
import stat

def download_dir(sftp, remote_dir, local_dir):
    try:
        os.makedirs(local_dir, exist_ok=True)
        for entry in sftp.listdir_attr(remote_dir):
            remote_path = remote_dir + "/" + entry.filename
            local_path = os.path.join(local_dir, entry.filename)
            if stat.S_ISDIR(entry.st_mode):
                download_dir(sftp, remote_path, local_path)
            else:
                try:
                    sftp.get(remote_path, local_path)
                    print(f"Downloaded: {remote_path}")
                except Exception as e:
                    print(f"Skipped {remote_path}: {e}")
    except Exception as e:
        print(f"Error accessing {remote_dir}: {e}")

try:
    print("Connecting to server...")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect('72.62.12.242', username='root', password='Datawise2026#')
    
    print("Opening SFTP session...")
    sftp = ssh.open_sftp()
    
    remote_path = '/var/www/datawiseconsultoria.com/app/backend'
    local_path = 'c:\\Users\\pedro.moreno\\Documents\\GitHub\\comunidad-connect\\scrapp_rediseño'
    
    print(f"Downloading from {remote_path} to {local_path}...")
    download_dir(sftp, remote_path, local_path)
    
    sftp.close()
    ssh.close()
    print("Download completed successfully!")
except Exception as e:
    print(f"Failed: {e}")
