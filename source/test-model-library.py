import http.server,json,os,pathlib,subprocess,tempfile,threading
class Handler(http.server.BaseHTTPRequestHandler):
 def log_message(self,*args):pass
 def do_GET(self):
  self.send_response(200);self.end_headers();self.wfile.write(json.dumps({'models':[{'name':'fixture:latest'}]}).encode())
 def do_POST(self):
  body=json.loads(self.rfile.read(int(self.headers.get('Content-Length',0))));name=body.get('model');self.send_response(200);self.end_headers()
  if name=='missing':self.wfile.write(b'{"error":"Fixture model unavailable"}\n')
  elif name=='partial':self.wfile.write(b'{"status":"pulling manifest"}\n')
  else:
   self.wfile.write(b'{"status":"pulling fixture","completed":3,');self.wfile.flush();self.wfile.write(b'"total":6}\n{"status":"success"}\n')
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),Handler)
threading.Thread(target=server.serve_forever,daemon=True).start()
repo=pathlib.Path(__file__).resolve().parent.parent
with tempfile.TemporaryDirectory(prefix='cymalika-native-models-') as tmp:
 p=pathlib.Path(tmp)
 (p/'main.swift').write_text('''import Foundation
struct Failure: LocalizedError { let message:String; init(_ message:String){self.message=message};var errorDescription:String? {message} }
let library=ModelLibrary(URL(fileURLWithPath:CommandLine.arguments[2]))
func call(_ args:[String:Any]) throws -> Any {let sem=DispatchSemaphore(value:0);var result:Result<Any,Error>?;library.handle(args){result=$0;sem.signal()};guard sem.wait(timeout:.now()+8) != .timedOut else {throw Failure("Fixture timed out")};return try result!.get()}
func wait(_ id:String) throws -> [String:Any] {for _ in 0..<100 {let rows=try call(["operation":"jobs"]) as! [[String:Any]];let row=rows.first{$0["id"] as? String==id}!;if row["state"] as? String != "running" {return row};Thread.sleep(forTimeInterval:0.02)};throw Failure("Fixture job timed out")}
do {
 for raw in ["https://example.com","http://localhost.evil.test","http://user:secret@localhost","http://localhost/path"] {do {_=try library.endpoint(raw);fatalError("Unsafe endpoint accepted")}catch{}}
 for raw in ["../escape","bad; command","a\\nb","http://evil/model"] {do {_=try library.modelName(raw);fatalError("Unsafe name accepted")}catch{}}
 let base=CommandLine.arguments[1]
 for (name,expected) in [("fixture","complete"),("partial","failed"),("missing","failed")] {let job=try call(["operation":"pull","endpoint":base,"name":name]) as! [String:Any];let result=try wait(job["id"] as! String);guard result["state"] as? String==expected else {throw Failure("Wrong state: \\(result)")}}
 library.close();print("PASS: native Swift model-library boundaries, fragmented download progress, installed-list verification and incomplete/error handling using a disposable local fixture. No AI model downloaded.")
}catch{fputs("\\(error)\\n",stderr);exit(1)}
''')
 subprocess.run(['xcrun','swiftc','-swift-version','5','-framework','AppKit',str(p/'main.swift'),str(repo/'source/ModelLibrary.swift'),str(repo/'source/Streams.swift'),'-o',str(p/'test')],check=True)
 subprocess.run([str(p/'test'),'http://127.0.0.1:'+str(server.server_port),str(p/'data')],check=True,timeout=30)
server.shutdown()
