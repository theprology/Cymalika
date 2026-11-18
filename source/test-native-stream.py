"""Exercise the actual Swift streaming transport with fragmented UTF-8 and HTTP errors."""
import http.server,threading,subprocess,json,time,pathlib
class Handler(http.server.BaseHTTPRequestHandler):
 def log_message(self,*a):pass
 def do_POST(self):
  self.rfile.read(int(self.headers.get('Content-Length','0')))
  if self.path=='/error':
   self.send_response(400);self.end_headers();self.wfile.write(b'{"error":"fixture failure"}');return
  if self.path=='/redirect':
   self.send_response(302);self.send_header('Location','/should-not-follow');self.end_headers();return
  self.send_response(200);self.send_header('Content-Type','application/x-ndjson');self.end_headers()
  data=('\n'.join([json.dumps({'message':{'content':'Hello 🌱'}},ensure_ascii=False),json.dumps({'message':{'content':' world'},'done':True})])+'\n').encode()
  for i in range(0,len(data),3):self.wfile.write(data[i:i+3]);self.wfile.flush();time.sleep(.001)
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),Handler);threading.Thread(target=server.serve_forever,daemon=True).start()
exe=pathlib.Path(__file__).resolve().parent.parent/'build/Cipher.app/Contents/MacOS/Cipher'
try:
 r=subprocess.run([str(exe),'--stream-probe',f'http://127.0.0.1:{server.server_port}/ok'],text=True,capture_output=True,timeout=20);assert r.returncode==0,r.stderr;lines=json.loads(r.stdout);assert json.loads(lines[0])['message']['content']=='Hello 🌱';assert json.loads(lines[1])['done']
 for route,status in [('error','400'),('redirect','302')]:
  r=subprocess.run([str(exe),'--stream-probe',f'http://127.0.0.1:{server.server_port}/{route}'],text=True,capture_output=True,timeout=20);assert r.returncode!=0 and status in r.stderr,(route,r)
 print('PASS: actual native streaming transport, fragmented UTF-8, HTTP errors, redirect rejection.')
finally:server.shutdown()
