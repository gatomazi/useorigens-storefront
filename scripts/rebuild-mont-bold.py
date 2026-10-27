#!/usr/bin/env python3
"""Rebuild the experimental local Mont Bold from user-provided assets.

Requires: fonttools, freetype-py, pillow. Writes OTF, proof image and provenance
under output/fonts/mont-bold-reconstruida. Does not publish or install fonts.
"""
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.t2CharStringPen import T2CharStringPen
from fontTools.pens.basePen import BasePen
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.transformPen import TransformPen
from fontTools.misc.transform import Transform
from ctypes import byref
from PIL import Image,ImageDraw,ImageFont
import freetype,hashlib,json,math,string,sys,unicodedata
from collections import Counter
class CubicContours(BasePen):
 def __init__(self,glyphSet):
  super().__init__(glyphSet); self.contours=[];self.current=[];self.last=None;self.first=None
 def _moveTo(self,p):self.first=self.last=tuple(p);self.current=[]
 def _lineTo(self,p):
  p0=self.last;p=tuple(p)
  if math.dist(p0,p)>.02:self.current.append((p0,tuple(a+(b-a)/3 for a,b in zip(p0,p)),tuple(a+2*(b-a)/3 for a,b in zip(p0,p)),p))
  self.last=p
 def _curveToOne(self,p1,p2,p3):
  self.current.append((self.last,tuple(p1),tuple(p2),tuple(p3)));self.last=tuple(p3)
 def _closePath(self):
  if math.dist(self.last,self.first)>.02:self._lineTo(self.first)
  if self.current:self.contours.append(self.current)
  self.current=[]
 def _endPath(self):self._closePath()


def contours(font,glyph):
 p=CubicContours(font.getGlyphSet());font.getGlyphSet()[glyph].draw(p);return p.contours


ROOT=Path(__file__).resolve().parent.parent
FONTS=ROOT/'assets/print-studio/fonts'
OUT=ROOT/'output/fonts/mont-bold-reconstruida'
OUT.mkdir(parents=True,exist_ok=True)
regular=TTFont(FONTS/'Mont-Regular-PDF.otf');heavy=TTFont(FONTS/'Mont-HeavyDEMO.otf');light=TTFont(FONTS/'Mont-ExtraLightDEMO.otf');bold=TTFont(FONTS/'Mont-Bold-PDF-PARCIAL.otf')
rc,hc,lc,bc=[f.getBestCmap() for f in [regular,heavy,light,bold]]
face=freetype.Face(str(FONTS/'Mont-Regular-PDF.otf'));face.set_char_size(0,1000*64,72,72)
T=.61
HEAVY_REAL=set(string.ascii_letters+string.digits+"'\"")

def bbox(cs):
 points=[point for contour in cs for segment in contour for point in segment]
 return (min(x for x,y in points),min(y for x,y in points),max(x for x,y in points),max(y for x,y in points)) if points else (0,0,0,0)
def evaluate(seg,t):
 return tuple((1-t)**3*seg[0][axis]+3*t*(1-t)**2*seg[1][axis]+3*t*t*(1-t)*seg[2][axis]+t**3*seg[3][axis] for axis in [0,1])
def area(c):
 p=[evaluate(s,t/4) for s in c for t in range(4)]
 return sum(p[i][0]*p[(i+1)%len(p)][1]-p[(i+1)%len(p)][0]*p[i][1] for i in range(len(p)))/2

def morph(a,b,t):
 if len(a)!=len(b):return None
 remaining=list(b);result=[]
 for ca in sorted(a,key=lambda c:abs(area(c)),reverse=True):
  candidates=[]
  for i,cb in enumerate(remaining):
   if len(ca)!=len(cb):continue
   if area(ca)*area(cb)<0:cb=[(s[3],s[2],s[1],s[0]) for s in cb[::-1]]
   for rotation in range(len(cb)):
    shifted=cb[rotation:]+cb[:rotation]
    cost=sum((pa[0]-pb[0])**2+(pa[1]-pb[1])**2 for sa,sb in zip(ca,shifted) for pa,pb in zip(sa,sb))
    candidates.append((cost,i,shifted))
  if not candidates:return None
  cost,i,cb=min(candidates,key=lambda item:item[0]);remaining.pop(i)
  result.append([tuple(tuple((1-t)*pa[axis]+t*pb[axis] for axis in [0,1]) for pa,pb in zip(sa,sb)) for sa,sb in zip(ca,cb)])
 return result

def transformed(cs,scaleX=1,scaleY=1,dx=0,dy=0):
 return [[tuple((x*scaleX+dx,y*scaleY+dy) for x,y in segment) for segment in c] for c in cs]

def embolden(ch,strength=80):
 face.load_char(ch,freetype.FT_LOAD_NO_HINTING|freetype.FT_LOAD_NO_BITMAP)
 outline=face.glyph.outline
 error=freetype.FT_Outline_EmboldenXY(byref(outline._FT_Outline),int(strength*64),int(strength*64))
 if error:raise RuntimeError(('FreeType embolden',ch,error))
 pen=CubicContours(None)
 def point(p):return (p.x/64,p.y/64)
 def move(p,ctx):
  if pen.current:pen.closePath()
  pen.moveTo(point(p))
 outline.decompose(move_to=move,line_to=lambda p,ctx:pen.lineTo(point(p)),cubic_to=lambda a,b,c,ctx:pen.curveTo(point(a),point(b),point(c)),conic_to=lambda a,b,ctx:pen.qCurveTo(point(a),point(b)))
 if pen.current:pen.closePath()
 return pen.contours

def fit(cs,target):
 box=bbox(cs);sx=(target[2]-target[0])/(box[2]-box[0]) if box[2]>box[0] else 1;sy=(target[3]-target[1])/(box[3]-box[1]) if box[3]>box[1] else 1
 return transformed(cs,sx,sy,target[0]-box[0]*sx,target[1]-box[1]*sy)

built={};methods={};advances={}
all_codes=sorted(set(rc)|set(range(32,127))|{0xA0,0xAA,0xBA})
for cp in all_codes:
 ch=chr(cp)
 if cp in bc:
  built[cp]=contours(bold,bc[cp]);advances[cp]=bold['hmtx'][bc[cp]][0];methods[cp]='original PDF Bold';continue
 if ch in "'\"":
  cs=morph(contours(light,lc[cp]),contours(heavy,hc[cp]),.75)
  assert cs is not None
  built[cp]=cs;advances[cp]=round(.25*light['hmtx'][lc[cp]][0]+.75*heavy['hmtx'][hc[cp]][0]);methods[cp]='ExtraLight/Heavy interpolation';continue
 if cp not in rc:continue
 a=contours(regular,rc[cp]);cs=None
 if ch in HEAVY_REAL and cp in hc:
  b=contours(heavy,hc[cp]);cs=morph(a,b,T)
  advances[cp]=round((1-T)*regular['hmtx'][rc[cp]][0]+T*heavy['hmtx'][hc[cp]][0])
  target=tuple((1-T)*x+T*y for x,y in zip(bbox(a),bbox(b)))
 else:
  r=bbox(a);target=(r[0]-8,r[1]-4,r[2]+4,r[3]+4)
  advances[cp]=max(100,regular['hmtx'][rc[cp]][0]-4)
 if cs is None:
  strength=8 if ch in '®™°' else 20 if ch in '©' else 35 if ch in '#%€£¥$+−=<>×÷≈±∑∫√∞*^~' else 80
  if strength<80:
   r=bbox(a);target=(r[0]-2,r[1]-1,r[2]+2,r[3]+1)
  cs=fit(embolden(ch,strength),target) if a else []
  methods[cp]='Regular vector reconstruction'
 else:methods[cp]='Regular/Heavy outline interpolation'
 built[cp]=cs
# Rebuild decomposable Latin diacritics on the finished Bold base instead of shrinking the whole accented glyph.
for cp in list(built):
 ch=chr(cp);decomposed=unicodedata.normalize('NFD',ch)
 if cp in bc or len(decomposed)<2 or ord(decomposed[0]) not in built:continue
 if any(unicodedata.combining(mark) in [202,220] for mark in decomposed[1:]):continue
 base=ord(decomposed[0]);source_base=ord('ı') if decomposed[0]=='i' and ord('ı') in rc else base
 if source_base not in rc:continue
 original_base=contours(regular,rc[source_base]);ob=bbox(original_base)
 source=contours(regular,rc[cp]);marks=[i for i,c in enumerate(source) if bbox([c])[1]>ob[3]+1]
 if not marks:continue
 finished_base=built[base]
 if decomposed[0]=='i':finished_base=[c for c in finished_base if bbox([c])[1]<540]
 nb=bbox(finished_base);thickened=embolden(ch,22);new_marks=[]
 for index in marks:
  mark=source[index];m=bbox([mark]);cx=(m[0]+m[2])/2+((nb[0]+nb[2])-(ob[0]+ob[2]))/2
  w=(m[2]-m[0])*1.12;h=(m[3]-m[1])*1.12;y=m[1]+nb[3]-ob[3]
  new_marks.extend(fit([thickened[index]],(cx-w/2,y,cx+w/2,y+h)))
 built[cp]=finished_base+new_marks;advances[cp]=advances[base];methods[cp]='Bold base with reconstructed diacritic'
# Preserve the x-height and baseline of the connected cedilla forms.
for ch in 'çÇ':
 cp=ord(ch);cs=embolden(ch,65);b=bbox(cs);orig=bbox(contours(regular,rc[cp]));target_top=bbox(built[ord('c' if ch=='ç' else 'C')])[3]
 sx=(orig[2]-orig[0]+12)/(b[2]-b[0]);dx=orig[0]-8-b[0]*sx
 built[cp]=[[tuple((x*sx+dx,y*target_top/b[3] if y>=0 else y) for x,y in seg) for seg in c] for c in cs]
 advances[cp]=advances[ord('c' if ch=='ç' else 'C')];methods[cp]='connected cedilla reconstruction'
# Fill nonbreaking space, ordinal symbols, and the standalone ASCII grave accent.
built[0xA0]=[];advances[0xA0]=advances[32];methods[0xA0]='space alias'
for cp,base in [(0xAA,ord('a')),(0xBA,ord('o'))]:
 built[cp]=transformed(built[base],.55,.55,12,310);advances[cp]=round(advances[base]*.55+24);methods[cp]='reconstructed ordinal'
accented=built[ord('à')]
accent=max(accented,key=lambda c:bbox([c])[1])
assert bbox([accent])[1]>500
ab=bbox([accent]);built[ord('`')]=transformed([accent],1,1,70-ab[0],0);advances[ord('`')]=round(ab[2]-ab[0]+140);methods[ord('`')]='reconstructed grave accent'

cmap={cp:('space' if cp==32 else f'uni{cp:04X}') for cp in built}
glyphs=['.notdef']+list(cmap.values())
chars={};metrics={}
pen=T2CharStringPen(600,None);pen.moveTo((60,0));pen.lineTo((60,700));pen.lineTo((540,700));pen.lineTo((540,0));pen.closePath();chars['.notdef']=pen.getCharString();metrics['.notdef']=(600,60)
for cp,name in cmap.items():
 pen=T2CharStringPen(advances[cp],None)
 for contour in built[cp]:
  pen.moveTo(contour[0][0])
  for segment in contour:pen.curveTo(*segment[1:])
  pen.closePath()
 chars[name]=pen.getCharString();metrics[name]=(advances[cp],math.floor(bbox(built[cp])[0]))
fb=FontBuilder(1000,isTTF=False);fb.setupGlyphOrder(glyphs);fb.setupCharacterMap(cmap)
fb.setupCFF('OrigensMontRebuilt-Bold',{'FullName':'Mont Origens Reconstruida Bold','FamilyName':'Mont Origens Reconstruida','Weight':'Bold','Notice':'Original font designs Copyright Fontfabric. Reconstructed from files supplied by the user for Origens.'},chars,{})
fb.setupHorizontalMetrics(metrics);fb.setupHorizontalHeader(ascent=1050,descent=-350,lineGap=0)
fb.setupNameTable({'familyName':'Mont Origens Reconstruida','styleName':'Bold','fullName':'Mont Origens Reconstruida Bold','psName':'OrigensMontRebuilt-Bold','uniqueFontIdentifier':'OrigensMontRebuilt-Bold-1.0','version':'Version 1.000; reconstructed approximation','copyright':'Original font designs Copyright Fontfabric. Reconstruction from user-provided files for Origens.','description':'Reconstructed approximation between Regular and Heavy. Existing PDF Bold glyphs retained; other characters interpolated or reconstructed. Not the original Mont Bold font.'})
fb.setupOS2(sTypoAscender=1050,sTypoDescender=-350,sTypoLineGap=0,usWinAscent=1100,usWinDescent=400,usWeightClass=700,usWidthClass=5,fsType=4,fsSelection=32,sxHeight=540,sCapHeight=700)
fb.setupPost();fb.setupMaxp();fb.font['head'].macStyle=1
fb.font['head'].created=regular['head'].created
fb.font['head'].modified=regular['head'].modified
fb.font.recalcTimestamp=False
file=OUT/'Mont-Bold-Reconstruida.otf';fb.save(file)
required=string.ascii_letters+string.digits+string.punctuation+' áéíóúàâêôãõçÁÉÍÓÚÀÂÊÔÃÕÇªº€£¥©®™°–—…“”‘’'
f=TTFont(file,checkChecksums=2)
assert all(ord(ch) in f.getBestCmap() for ch in required)
assert f['maxp'].numGlyphs==len(built)+1
report={'sources':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in [FONTS/'Mont-Regular-PDF.otf',FONTS/'Mont-HeavyDEMO.otf',FONTS/'Mont-ExtraLightDEMO.otf',FONTS/'Mont-Bold-PDF-PARCIAL.otf']},'file':file.name,'sha256':hashlib.sha256(file.read_bytes()).hexdigest(),'glyphs':len(glyphs),'unicode_characters':len(cmap),'reconstruction_methods':dict(Counter(methods.values())),'characters':[{ 'character':chr(cp),'unicode':f'U+{cp:04X}','method':methods[cp]} for cp in sorted(built)]}
(OUT/'verificacao.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({k:v for k,v in report.items() if k!='characters'},ensure_ascii=False))
# One batched visual check: text, accents, and symbols using the generated file itself.
font=lambda size:ImageFont.truetype(str(file),size)
im=Image.new('RGB',(1800,1500),'#f4f1eb');draw=ImageDraw.Draw(im)
label=ImageFont.truetype(str(FONTS/'Mont-Regular-PDF.otf'),29)
draw.text((55,35),'MONT BOLD / RECONSTRUÍDA PARA ORIGENS',font=label,fill='#181818')
lines=[('Não tá morto',95),('quem peleia',95),('amigo secreto. & cuca&',78),('ABCDEFGHIJKLMNOPQRSTUVWXYZ',51),('abcdefghijklmnopqrstuvwxyz',58),('Á É Í Ó Ú À Â Ê Ô Ã Õ Ç / á é í ó ú à â ê ô ã õ ç',43),('0123456789  1º  2ª  Nº  35°C',60),('! " # $ % & \' ( ) * + , - . / : ; < = > ? @',52),('[ \\ ] ^ _ ` { | } ~  € £ ¥ © ® ™',55),('“Quem peleia?” — @usesul.oficial',60)]
y=115
for text,size in lines:
 assert draw.textbbox((55,y),text,font=font(size))[2]<1745
 draw.text((55,y),text,font=font(size),fill='#181818');y+=120
im.save(OUT/'previa-mont-bold-reconstruida.png')
(OUT/'LEIA-ME.txt').write_text('''MONT BOLD RECONSTRUÍDA PARA ORIGENS

Versão experimental intermediária entre Regular e Heavy, criada a partir dos
arquivos fornecidos pelo usuário. Não é o arquivo original completo da Mont Bold.
Os glifos Bold disponíveis no PDF foram preservados. Letras ausentes foram
interpoladas entre contornos compatíveis; acentos e símbolos foram reconstruídos
a partir da Regular para não usar os desenhos de substituição dos arquivos DEMO.
Aspas, acento grave, espaço sem quebra e símbolos ordinais também foram incluídos.

Inclui ASCII completo, acentos usados em português e os símbolos mostrados
na prévia. O manifesto verificacao.json detalha a origem de cada caractere.
Não inclui todos os caracteres de todas as línguas, nem as tabelas originais de
kerning, recursos avançados ou fonte variável. Revise a prévia antes de imprimir.
''')
