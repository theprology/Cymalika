"""Render a narrated, captioned documentation tour from isolated UI captures.

Requires Pillow and imageio-ffmpeg. On macOS, narration uses the installed
Samantha voice. No browser, account, personal project or model is controlled.
"""
from pathlib import Path
import json,subprocess,aifc,math,textwrap,hashlib,zipfile,shutil
from PIL import Image,ImageDraw,ImageFont
import imageio_ffmpeg
ROOT=Path(__file__).resolve().parent.parent
WORK=Path(__import__('sys').argv[1]).resolve() if len(__import__('sys').argv)>1 else ROOT.parent/'guide-production-060'
OUT=ROOT/'docs/media';OUT.mkdir(exist_ok=True)
FRAMES=WORK/'frames';FRAMES.mkdir(exist_ok=True)
AUDIO=WORK/'audio';AUDIO.mkdir(exist_ok=True)
CLIPS=WORK/'clips';CLIPS.mkdir(exist_ok=True)
FONT='/System/Library/Fonts/Supplemental/Arial.ttf';BOLD='/System/Library/Fonts/Supplemental/Arial Bold.ttf'
def font(size,bold=False):return ImageFont.truetype(BOLD if bold else FONT,size)
def wrap(draw,text,ft,width):
 lines=['']
 for word in text.split():
  candidate=(lines[-1]+' '+word).strip()
  if draw.textlength(candidate,font=ft)>width and lines[-1]:lines.append(word)
  else:lines[-1]=candidate
 return lines
# title, short instruction, narration, capture, screenshot name, state label
SCENES=[
 ('Download Cipher','Choose the installer for your computer.','Welcome to Cipher. This guide starts from downloading the app. You do not need to know how to code. Pause the video whenever you want. Some first-time setup views are illustrated examples.',None,None,'Illustrated download guide'),
 ('Choose your file','Mac: DMG. Windows: setup EXE. Ubuntu: DEB.','Open the latest release on GitHub and scroll to Assets. Choose the Mac DMG, Windows setup EXE, or the Linux package for your computer. Do not choose source code to use the app.',None,None,'Installer choices; see written guide for platform requirements'),
 ('Meet your workspace','Open Cipher. You do not need VS Code.','Open Cipher after installing it. Your messages and replies appear in the middle. Files appear on the left. Models and downloads is near the model selector at the top.','01-welcome','cipher-workspace.png','Cipher 0.6.0 interface'),
 ('Already have Ollama?','Keep it installed. Choose your existing model.','If you already have Ollama and a model, leave them installed. Open Models and downloads, then Installed models. Click Use this model. If it already says Selected, you are ready.','02-existing-model','cipher-existing-model.png','Existing local model; no model download'),
 ('Starting from scratch?','Local engine → Install local engine.','For a new setup, open Local engine and choose Install local engine. Ollama is the engine that runs local models. Cipher can install its own internal copy, so a separate Ollama installer is not required.','03-new-engine','cipher-engine.png','Fresh-install illustration; no installation performed'),
 ('First, the engine','Review. Install. Wait. Start the engine.','Review the official engine download and choose Install this engine when you want it. Wait for it to finish, then click Start local engine. Installing the engine alone does not install an AI model.','04-engine-review','cipher-engine-review.png','Runtime review only; download not executed'),
 ('Next, a model','Get models → enter an ID → Find model.','Now open Get models. Enter the model ID you want, then choose Find model. The written guide gives qwen three colon four b as one example. Its suitability depends on your computer and the task.','05-get-model','cipher-downloads.png','Choose a model yourself; example ID shown in the guide'),
 ('Review the download','Confirm only the model you want.','Check the model name, license and available space. Choose Download this model and wait for completion. Then open Installed models and choose Use this model. Look for Connected in the chat window.','06-model-review','cipher-model-review.png','Review only; the example model was not downloaded'),
 ('Ask something simple','Ask → type → Enter.','Start with Ask mode. Type, Hello, explain what you can help me do using simple words. Press Enter to send. Shift and Enter adds a new line. The first model load can take longer.','09-ask','cipher-ask.png','Prepared question; not a live inference recording'),
 ('Your first file','Build → ask for hello.txt → review.','Make a new practice folder and open it in Cipher. Choose Build. Ask for a hello dot text file containing My assistant is working. Read the proposed filename and text, then choose Approve and save.','22-first-file-review','cipher-first-file-review.png','Prepared first-file request; real review and save controls'),
 ('It really saved','Click hello.txt in Explorer.','Click hello dot text in Explorer to read what was saved. This is a real text file in the disposable practice folder. You do not need Python, a terminal, or programming knowledge for this first task.','23-first-file-saved','cipher-first-file-saved.png','Actual saved text file; no commands needed'),
 ('Open your folder','A project is simply a folder of files.','Click Open project and choose a practice folder. Files appear in Explorer. Click a file to read it. You do not need to attach every file. The model can search the selected project.','08-explorer','cipher-explorer.png','Disposable practice project'),
 ('Start with a plan','Plan explains the approach before changes.','Ask gives explanations. Plan proposes an approach before changes. Build can propose edits and actions. For important work, ask for a plan first and read what it intends to change.','10-plan','cipher-plan.png','Prepared question; no AI-generated plan claimed'),
 ('Review before saving','Check the filename and the changed lines.','This prepared example shows the real edit review screen. Read the filename and proposed contents. Green lines are additions and red lines are removals. Approve and save writes the file. Reject leaves the proposal unapplied.','11-review-edit','cipher-review.png','Prepared teaching edit; real approval controls'),
 ('Check the saved file','Saved means the file write returned successfully.','After approval, the card says Saved and checkpoint created. Open the file in Explorer to inspect the result. Undo this save can restore earlier contents if the file has not changed again.','12-saved','cipher-saved.png','Actual save in the disposable practice project'),
 ('Review a command','Read it before choosing Run command.','A code project may have tests. Read a proposed command before choosing Run command. If you do not understand it, reject it and ask for an explanation. The optional practice exercise needs Python three.','13-command','cipher-command.png','Actual command review; Python is optional for the beginner text-file task'),
 ('Read real results','Activity → Terminal shows actual output.','The practice project now reports two tests and O K. This is real output from the disposable example. A reply saying done is not proof. Read the results and check your project normally.','14-tests','cipher-tests.png','Real local test output: two tests passed'),
 ('Inspect the result','Open the changed file in Explorer.','The saved source now multiplies price by quantity. Your first task can be much simpler: ask for a hello dot text file in a new practice folder. The written guide explains every step.','15-fixed-file','cipher-fixed-file.png','Actual saved practice source'),
 ('Give it a name','Settings → Appearance → Your assistant’s name.','You can name your assistant. Open Settings, then Appearance. Enter a name and save. The sidebar and replies use it. This example uses Atlas. The installed application is still called Cipher.','07-name','cipher-name.png','Name setting illustration'),
 ('Several models','Save connections and switch when you need.','Keep several models installed if you have enough disk space. Save named connections for local or cloud models. Choose one from the chat header. Keeping multiple models loaded uses extra memory.','18-connections','cipher-connections.png','Saved connection controls; API keys remain session-only'),
 ('Extra tools, later','Goals. Plans. Resources. Memory. Git.','More tools opens plans, goals, resources, project memory, Git and external tool connections. You do not need to configure all of them on day one. Add the tools that help your task.','16-workbench','cipher-workbench.png','Workbench overview'),
 ('Computer access','Optional: let the model request app and web actions.','The Computer access switch lets your model request app, web and ordinary file actions. Review each proposed action. macOS permissions may need your direct approval. Turn access off when finished. The guide explains these steps.','01-welcome','cipher-computer-access.png','Access remains off in this demonstration'),
 ('Make it comfortable','Pick a theme, a colour and readable text.','Appearance offers light, dark and hacker themes. Change colour and the colour dots change the whole app palette. Choose a text size that is comfortable for you.','19-colours','cipher-colours.png','Shared appearance controls'),
 ('Give me a coffee','A quick splash, then back to work.','Coffee keeps your computer awake while Cipher is open. The coffee and water animation says Thanks man, then returns to chat. Keep-awake stays on until you turn it off or quit.','20-coffee','cipher-coffee.png','Coffee effect; operating-system sleep boundaries still apply'),
 ('You can take it slowly','Getting started reopens the in-app tour.','Getting started reopens the tour whenever you are lost. Start with one reply and one small reviewed file. Then learn the advanced tools. The GitHub guide, transcript and printable handbook are there whenever you need them.','21-tour',None,'End of guide; no runtime or model was downloaded')]
# Show folder selection before asking for the first file.
SCENES[9:12] = [SCENES[11], SCENES[9], SCENES[10]]
ff=imageio_ffmpeg.get_ffmpeg_exe();chapters=[];start=0;gif=[]
for i,(title,body,speech,capture,shot_name,state) in enumerate(SCENES):
 textfile=AUDIO/f'{i:02}.txt';audio=AUDIO/f'{i:02}.aiff';textfile.write_text(speech)
 subprocess.run(['/usr/bin/say','-v','Samantha','-r','170','--file-format=AIFF','--data-format=BEI16@22050','-o',str(audio),'-f',str(textfile)],check=True)
 with aifc.open(str(audio)) as a:duration=max(7,a.getnframes()/a.getframerate()+1.7)
 im=Image.new('RGB',(1920,1080),'#0b1210');d=ImageDraw.Draw(im)
 d.rounded_rectangle((34,35,96,97),18,fill='#95e8b3');d.text((49,43),'C',font=font(42,True),fill='#10251a');d.text((114,49),'Cipher',font=font(33,True),fill='#edf9f2')
 d.text((42,153),f'STEP {i+1:02} / {len(SCENES):02}',font=font(18,True),fill='#92dbaa')
 y=206
 for line in wrap(d,title,font(40,True),355):d.text((40,y),line,font=font(40,True),fill='#f3f9f4');y+=49
 y+=28
 for line in wrap(d,body,font(26),355):d.text((40,y),line,font=font(26),fill='#b8cbbf');y+=38
 d.text((40,922),'YOUR MODELS.',font=font(18,True),fill='#96dfb2');d.text((40,950),'YOUR WORKSPACE.',font=font(18,True),fill='#96dfb2')
 if capture:
  picture=Image.open(WORK/'captures'/f'{capture}.png').convert('RGB')
  if capture in ['02-existing-model','03-new-engine','04-engine-review','05-get-model','06-model-review','07-name','16-workbench','18-connections','21-tour']:
   # Focus on the dialog while preserving the captured controls and labels.
   picture=picture.crop((round(picture.width*.08),round(picture.height*.03),round(picture.width*.92),round(picture.height*.97)))
  picture.thumbnail((1410,800),Image.Resampling.LANCZOS);x=465+(1410-picture.width)//2;y=73+(800-picture.height)//2;im.paste(picture,(x,y));d.rounded_rectangle((x-1,y-1,x+picture.width+1,y+picture.height+1),12,outline='#355343',width=2)
  if shot_name:shutil.copyfile(WORK/'captures'/f'{capture}.png',OUT/shot_name)
 else:
  d.text((515,158),'INSTALL CIPHER',font=font(42,True),fill='#f0faf3')
  for j,(heading,detail) in enumerate([('Mac · Apple Silicon','Choose mac-arm64.dmg'),('Windows · 64-bit','Choose x64-setup.exe'),('Ubuntu / Debian · 64-bit','Choose amd64.deb')]):
   yy=260+j*166;d.rounded_rectangle((505,yy,1800,yy+135),20,fill='#14251b',outline='#355343',width=2);d.text((539,yy+25),heading,font=font(31,True),fill='#e7f6ed');d.text((539,yy+76),detail,font=font(25),fill='#a7c1b0')
  d.text((515,814),'github.com/theprology/cipher/releases/latest',font=font(24),fill='#95e8b3')
 d.rounded_rectangle((458,898,1880,1013),15,fill='#17261e')
 lines=wrap(d,speech,font(24),1370)
 if len(lines)>3:raise ValueError('Caption too long: '+title)
 for j,line in enumerate(lines):d.text((484,912+j*29),line,font=font(24),fill='#ecf5ef')
 d.text((42,1032),'CIPHER 0.6.0  /  BEGINNER WALKTHROUGH',font=font(16,True),fill='#82a992')
 state_lines=wrap(d,state,font(15),1270)
 d.text((470,1032),state_lines[0],font=font(15),fill='#8aab96')
 frame=FRAMES/f'{i:02}.png';im.save(frame)
 clip=CLIPS/f'{i:02}.mp4'
 subprocess.run([ff,'-y','-v','error','-loop','1','-i',str(frame),'-i',str(audio),'-t',str(round(duration,3)),'-vf','fps=24','-c:v','libx264','-preset','veryfast','-tune','stillimage','-crf','24','-pix_fmt','yuv420p','-c:a','aac','-b:a','96k','-af','apad','-movflags','+faststart',str(clip)],check=True)
 chapters.append({'number':i+1,'start':round(start,3),'seconds':round(duration,3),'title':title,'instruction':body,'narration':speech,'capture':capture,'state':state});start+=duration
 if i in [0,2,3,4,6,7,8,9,10,11,13,16,18,20,23,24]:
  thumb=im.copy();thumb.thumbnail((960,540),Image.Resampling.LANCZOS);gif.append(thumb)
 print('Rendered',i+1,title,flush=True)
concat=WORK/'timeline.txt';concat.write_text(''.join("file '"+str(CLIPS/f'{i:02}.mp4')+"'\n" for i in range(len(SCENES))))
subprocess.run([ff,'-y','-v','error','-f','concat','-safe','0','-i',str(concat),'-c','copy','-movflags','+faststart',str(OUT/'cipher-walkthrough.mp4')],check=True)
gif[0].save(OUT/'cipher-walkthrough.gif',save_all=True,append_images=gif[1:],duration=2800,loop=0,optimize=True)
Image.open(FRAMES/'00.png').save(OUT/'cipher-video-poster.png',optimize=True)
(WORK/'chapters.json').write_text(json.dumps(chapters,indent=2))
def stamp(seconds,sep=':'):
 h=int(seconds//3600);m=int(seconds%3600//60);s=seconds%60
 return f'{h:02}:{m:02}:{int(s):02}'+sep+f'{round((s-int(s))*1000):03}'
srt=[];vtt=['WEBVTT\n']
trans=['# Cipher 0.6.0: narrated walkthrough transcript','', 'This is a guided interface demonstration, not a live inference or download benchmark. First-install views and prepared questions/edits are labelled illustrations. The disposable file save and two-test command result are real. Narration uses the installed macOS Samantha synthetic voice. No real credential, personal project, runtime download or model download is included.','']
for c in chapters:
 t=int(c['start']);label=f'{t//60:02}:{t%60:02}';trans.extend([f'## {label} — {c["title"]}','',c['narration'],'',f'*Capture note: {c["state"]}.*',''])
 srt.extend([str(c['number']),stamp(c['start'],',')+' --> '+stamp(c['start']+c['seconds']-.1,','),c['narration'],''])
 vtt.extend([stamp(c['start'],'.')+' --> '+stamp(c['start']+c['seconds']-.1,'.'),c['narration'],''])
(OUT/'TRANSCRIPT.md').write_text('\n'.join(trans));(OUT/'cipher-walkthrough.srt').write_text('\n'.join(srt));(OUT/'cipher-walkthrough.vtt').write_text('\n'.join(vtt))
print(json.dumps({'video_seconds':round(start,2),'chapters':len(chapters),'video_bytes':(OUT/'cipher-walkthrough.mp4').stat().st_size,'gif_bytes':(OUT/'cipher-walkthrough.gif').stat().st_size}))
