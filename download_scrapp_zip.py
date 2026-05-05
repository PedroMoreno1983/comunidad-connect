import paramiko
import os
import sys

try:
    print("Connecting to server...")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect('72.62.12.242', username='root', password='Datawise2026#')
    
    print("Opening SFTP session...")
    sftp = ssh.open_sftp()
    
    remote_path = '/var/www/datawiseconsultoria.com/app/scrapp_backend.tar.gz'
    local_path = 'c:\\Users\\pedro.moreno\\Documents\\GitHub\\comunidad-connect\\scrapp_rediseño\\scrapp_backend.tar.gz'
    
    print(f"Downloading {remote_path}...")
    sftp.get(remote_path, local_path)
    
    sftp.close()
    ssh.close()
    print("Download completed successfully!")
except Exception as e:
    print(f"Failed: {e}")
