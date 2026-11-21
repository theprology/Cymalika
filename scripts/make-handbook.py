"""Create the printable beginner guide from the same walkthrough published online."""
from pathlib import Path
import re,html,json
from urllib.parse import urljoin
from reportlab.platypus import SimpleDocTemplate,Paragraph,Spacer,PageBreak,Table,TableStyle,Image,KeepTogether
from reportlab.lib.styles import getSampleStyleSheet,ParagraphStyle
from reportlab.lib import colors
ROOT=Path(__file__).resolve().parent.parent
OUT=ROOT/'docs/CyMalika-Beginners-Handbook.pdf'
VERSION=json.loads((ROOT/'package.json').read_text())['version']
INK=colors.HexColor('#182d21');MUTED=colors.HexColor('#607269');ACCENT=colors.HexColor('#24633c');PALE=colors.HexColor('#eef5ef');LINE=colors.HexColor('#d9e5dc')
styles=getSampleStyleSheet()
styles.add(ParagraphStyle(name='BodyCyMalika',fontName='Helvetica',fontSize=10.4,leading=14.4,textColor=INK,spaceAfter=6))
styles.add(ParagraphStyle(name='H1CyMalika',fontName='Helvetica-Bold',fontSize=20,leading=25,textColor=INK,spaceBefore=16,spaceAfter=11,keepWithNext=True))
styles.add(ParagraphStyle(name='H2CyMalika',fontName='Helvetica-Bold',fontSize=13,leading=18,textColor=ACCENT,spaceBefore=12,spaceAfter=8,keepWithNext=True))
styles.add(ParagraphStyle(name='TableCyMalika',fontName='Helvetica',fontSize=9.2,leading=13.2,textColor=INK,spaceAfter=0))
styles.add(ParagraphStyle(name='CaptionCyMalika',fontName='Helvetica',fontSize=8.4,leading=11,textColor=MUTED,spaceAfter=12))
styles.add(ParagraphStyle(name='EyebrowCyMalika',fontName='Helvetica-Bold',fontSize=9,leading=14,textColor=ACCENT,spaceAfter=16))
def clean(s):
 return s.replace('→',' > ').replace('—',' - ').replace('–','-').replace('“','"').replace('”','"').replace('’',"'").replace('…','...').replace('•','-')
def markup(s):
 links=[]
 def link(m):
  label,target=m.groups();url=target if target.startswith('https://') else urljoin('https://github.com/theprology/Cymalika/blob/main/docs/',target)
  links.append((label,url));return f'LINKPLACEHOLDER{len(links)-1}END'
 s=re.sub(r'\[([^\]]+)\]\(([^)]+)\)',link,clean(s));s=html.escape(s)
 s=re.sub(r'\*\*(.+?)\*\*',r'<b>\1</b>',s);s=re.sub(r'`(.+?)`',r'<font name="Courier">\1</font>',s)
 for i,(label,url) in enumerate(links):s=s.replace(f'LINKPLACEHOLDER{i}END',f'<link href="{html.escape(url,quote=True)}" color="#24633c"><u>{html.escape(label)}</u></link>')
 return s

def footer(c,doc):
 w,h=doc.pagesize;c.setFillColor(colors.HexColor('#fbfdfb'));c.rect(0,0,w,h,fill=1,stroke=0)
 c.setStrokeColor(LINE);c.line(52,h-38,w-52,h-38);c.setFont('Helvetica-Bold',8);c.setFillColor(ACCENT);c.drawString(52,h-27,'CYMALIKA / START HERE');c.setFont('Helvetica',8);c.setFillColor(MUTED);c.drawString(52,28,f'Version {VERSION}  |  Your models. Your workspace.');c.drawRightString(w-52,28,str(doc.page))

def parse(lines):
 result=[];i=0
 while i<len(lines):
  line=lines[i].strip()
  if not line or line.startswith('# '):i+=1;continue
  image=re.fullmatch(r'!\[([^\]]*)\]\(([^)]+)\)',line)
  if image:
   alt,name=image.groups();p=ROOT/'docs'/name
   if not p.is_file():raise FileNotFoundError(p)
   fig=Image(str(p));ratio=min(491/fig.imageWidth,265/fig.imageHeight);fig.drawWidth=fig.imageWidth*ratio;fig.drawHeight=fig.imageHeight*ratio
   result.append(KeepTogether([Spacer(1,5),fig,Spacer(1,7),Paragraph(markup(alt),styles['CaptionCyMalika'])]));i+=1;continue
  if line.startswith('|'):
   rows=[]
   while i<len(lines) and lines[i].strip().startswith('|'):
    cells=[x.strip() for x in lines[i].strip().strip('|').split('|')]
    if not all(re.fullmatch(r'[-: ]+',x) for x in cells):rows.append([Paragraph(markup(x),styles['TableCyMalika']) for x in cells])
    i+=1
   if len(rows)>7:
    for row in rows[1:]:
     result.append(KeepTogether([Paragraph('<b>'+row[0].text+'</b><br/>'+row[1].text,styles['BodyCyMalika']),Spacer(1,3)]))
    continue
   table=Table(rows,colWidths=[142,349],repeatRows=1,hAlign='LEFT');table.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),PALE),('LINEBELOW',(0,0),(-1,0),1,LINE),('LINEBELOW',(0,1),(-1,-1),.5,LINE),('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),9),('RIGHTPADDING',(0,0),(-1,-1),9),('TOPPADDING',(0,0),(-1,-1),8),('BOTTOMPADDING',(0,0),(-1,-1),8)]));result.extend([table,Spacer(1,12)]);continue
  if line.startswith('## '):result.append(Paragraph(markup(line[3:]),styles['H1CyMalika']))
  elif line.startswith('### '):result.append(Paragraph(markup(line[4:]),styles['H2CyMalika']))
  elif line.startswith('- '):result.append(Paragraph('&#8226; '+markup(line[2:]),styles['BodyCyMalika']))
  else:result.append(Paragraph(markup(line),styles['BodyCyMalika']))
  i+=1
 return result

story=[Spacer(1,55),Paragraph('THE BEGINNER\'S HANDBOOK',styles['EyebrowCyMalika'])]
cover=ParagraphStyle('Cover',fontName='Helvetica-Bold',fontSize=46,leading=52,textColor=INK,spaceAfter=24)
story.extend([Paragraph('Start with CyMalika.',cover),Paragraph('Download. Set up.<br/>Ask. Review. Verify.',ParagraphStyle('Subtitle',fontName='Helvetica',fontSize=25,leading=34,textColor=ACCENT,spaceAfter=25)),Paragraph('A plain-language guide from your first download to your first saved file. No coding knowledge is needed for the first exercise.',styles['BodyCyMalika']),Spacer(1,20)])
for title,body in [('Already have Ollama?','Keep it installed and choose your model inside CyMalika.'),('Starting from scratch?','Install the internal engine, then download and select a model.'),('Want a cloud API?','Connect a supported provider instead of running a local model.'),('Your first success','Receive a reply, approve a tiny text file, then open it to check the save.')]:story.extend([Paragraph(title,styles['H2CyMalika']),Paragraph(body,styles['BodyCyMalika'])])
story.extend([Spacer(1,18),Paragraph(markup('[Open the picture guide and narrated video](https://github.com/theprology/Cymalika/blob/main/docs/DEMO.md)'),styles['BodyCyMalika']),PageBreak()])
story.extend(parse((ROOT/'docs/WALKTHROUGH.md').read_text().splitlines()))
doc=SimpleDocTemplate(str(OUT),pagesize=(595.28,841.89),leftMargin=52,rightMargin=52,topMargin=56,bottomMargin=52,title='CyMalika: Start Here - Beginner Handbook',author='theprology',subject='Download, local model setup, first question and reviewed file creation')
doc.build(story,onFirstPage=footer,onLaterPages=footer)
print(OUT)
