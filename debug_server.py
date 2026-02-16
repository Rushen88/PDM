#!/usr/bin/env python3
"""
Debug server startup.
"""
import subprocess
import time
import os

# Start Django server on port 8888
os.chdir(r"D:\B2B\PDM\backend")
server = subprocess.Popen(
    [r"D:\B2B\PDM\.venv\Scripts\python.exe", "manage.py", "runserver", "127.0.0.1:8888"],
    stdout=subprocess.PIPE,
    stderr=subprocess.STDOUT
)

print("Server starting...")
time.sleep(6)

# Read output
server.poll()
if server.returncode is not None:
    print(f"Server exited with code: {server.returncode}")
else:
    print("Server is running")
    
# Read stdout
try:
    output = server.stdout.read(4096).decode('utf-8', errors='replace')
    print("Server output:")
    print(output)
except Exception as e:
    print(f"Error reading output: {e}")

# Check port
import socket
sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
result = sock.connect_ex(('127.0.0.1', 8888))
sock.close()
print(f"Port 8888 open: {result == 0}")

server.terminate()
server.wait()
