from pathlib import Path
import re,html
from reportlab.platypus import SimpleDocTemplate,Paragraph,Spacer,PageBreak,Table,TableStyle
from reportlab.lib.styles import getSampleStyleSheet,ParagraphStyle
from reportlab.lib import colors
ROOT=Path(__file__).resolve().parent.parent
OUT=ROOT/'docs/Cipher-Beginners-Handbook.pdf'
INK=colors.HexColor('#222a23');MUTED=colors.HexColor('#5e685f');ACCENT=colors.HexColor('#35583b');PALE=colors.HexColor('#eaf0e5');LINE=colors.HexColor('#dce2d8')
styles=getSampleStyleSheet()
styles.add(ParagraphStyle(name='BodyCipher',fontName='Helvetica',fontSize=10.5,leading=15,textColor=INK,spaceAfter=6))
styles.add(ParagraphStyle(name='H1Cipher',fontName='Helvetica-Bold',fontSize=22,leading=28,textColor=INK,spaceBefore=10,spaceAfter=10,keepWithNext=True))
styles.add(ParagraphStyle(name='H2Cipher',fontName='Helvetica-Bold',fontSize=13,leading=19,textColor=ACCENT,spaceBefore=12,spaceAfter=9,keepWithNext=True))
styles.add(ParagraphStyle(name='TableCipher',fontName='Helvetica',fontSize=9.5,leading=14,textColor=INK,spaceAfter=0))
styles.add(ParagraphStyle(name='EyebrowCipher',fontName='Helvetica-Bold',fontSize=9,leading=14,textColor=ACCENT,spaceAfter=12))
def markup(s):
 s=s.replace('→',' > ').replace('—',' - ').replace('–','-').replace('“','"').replace('”','"').replace('’',"'")
 s=html.escape(s);s=re.sub(r'\*\*(.+?)\*\*',r'<b>\1</b>',s);s=re.sub(r'`(.+?)`',r'<font name="Courier">\1</font>',s);return s

def footer(c,doc):
 w,h=doc.pagesize;c.setFillColor(colors.HexColor('#fbfcf9'));c.rect(0,0,w,h,fill=1,stroke=0)
 c.setStrokeColor(LINE);c.line(52,h-38,w-52,h-38);c.setFont('Helvetica-Bold',8);c.setFillColor(ACCENT);c.drawString(52,h-27,'CIPHER / GETTING STARTED');c.setFont('Helvetica',8);c.setFillColor(MUTED);c.drawString(52,28,'Version 0.3.0  |  Your models. Your workspace.');c.drawRightString(w-52,28,str(doc.page))

def parse(lines):
 result=[];i=0
 while i<len(lines):
  line=lines[i].strip()
  if not line:i+=1;continue
  if line.startswith('|'):
   rows=[]
   while i<len(lines) and lines[i].strip().startswith('|'):
    cells=[x.strip() for x in lines[i].strip().strip('|').split('|')]
    if not all(re.fullmatch(r'[-: ]+',x) for x in cells):rows.append([Paragraph(markup(x),styles['TableCipher']) for x in cells])
    i+=1
   table=Table(rows,colWidths=[135,340],repeatRows=1,hAlign='LEFT');table.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),PALE),('LINEBELOW',(0,0),(-1,0),1,LINE),('LINEBELOW',(0,1),(-1,-1),.5,LINE),('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),10),('RIGHTPADDING',(0,0),(-1,-1),10),('TOPPADDING',(0,0),(-1,-1),8),('BOTTOMPADDING',(0,0),(-1,-1),8)]));result.extend([table,Spacer(1,12)]);continue
  if line.startswith('## '):result.append(Paragraph(markup(line[3:]),styles['H1Cipher']))
  elif line.startswith('### '):result.append(Paragraph(markup(line[4:]),styles['H2Cipher']))
  elif line.startswith('- '):result.append(Paragraph('&#8226; '+markup(line[2:]),styles['BodyCipher']))
  else:result.append(Paragraph(markup(line),styles['BodyCipher']))
  i+=1
 return result

text=(ROOT/'docs/WALKTHROUGH.md').read_text();sections=re.split(r'(?m)^## ',text)[1:];sections=['## '+s for s in sections]
groups=[[0,1,2],[3,4],[5,6],[7],[8,9,10],[11,12],[13,14]]
story=[]
story.append(Spacer(1,64));story.append(Paragraph('THE BEGINNER\'S HANDBOOK',styles['EyebrowCipher']))
cover=ParagraphStyle('Cover',fontName='Helvetica-Bold',fontSize=52,leading=58,textColor=INK,spaceAfter=24)
story.append(Paragraph('Meet Cipher.',cover));story.append(Paragraph('From your first question<br/>to a reviewed code change.',ParagraphStyle('Subtitle',fontName='Helvetica',fontSize=23,leading=32,textColor=ACCENT,spaceAfter=28)))
story.append(Paragraph('A plain-language, step-by-step guide.<br/>No programming knowledge needed to follow along.',styles['BodyCipher']));story.append(Spacer(1,36))
for title,description in [('Connect','Use a model you already installed.'),('Explore','Open your folder and ask about it.'),('Build','Review changes before saving them.'),('Verify','Check the result and know how to undo it.')]:
 story.append(Paragraph(title,styles['H2Cipher']));story.append(Paragraph(description,styles['BodyCipher']))
story.append(Spacer(1,18));story.append(Paragraph('Replay the tour in the app: <b>Getting started</b>, near the bottom-left.',styles['BodyCipher']));story.append(PageBreak())
for gi,group in enumerate(groups):
 for si in group:
  if si<len(sections):story.extend(parse(sections[si].splitlines()))
 if gi<len(groups)-1:story.append(PageBreak())
doc=SimpleDocTemplate(str(OUT),pagesize=(595.28,841.89),leftMargin=52,rightMargin=52,topMargin=56,bottomMargin=52,title='Cipher: The Beginner\'s Handbook',author='theprology',subject='Step-by-step guide to using Cipher')
doc.build(story,onFirstPage=footer,onLaterPages=footer)
print(OUT)
