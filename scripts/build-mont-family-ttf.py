#!/usr/bin/env python3
"""Build a reconstructed 20-face Mont Origens TrueType family from supplied fonts.
Requires fonttools, freetype-py, pillow, numpy and scipy. Writes output only.
Italic faces are oblique constructions; this is not the original commercial Mont family.
"""
from pathlib import Path
from ctypes import byref
from collections import Counter
import hashlib,json,math,string,sys,zipfile
import freetype,numpy as np
from scipy.ndimage import distance_transform_edt,maximum_filter
from PIL import Image,ImageDraw,ImageFont
from fontTools.ttLib import TTFont,newTable
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.basePen import BasePen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.pens.cu2quPen import Cu2QuPen
from fontTools.pens.transformPen import TransformPen

ROOT=Path(__file__).resolve().parent.parent
SRC=ROOT/'assets/print-studio/fonts'
OUT=ROOT/'output/fonts/mont-origens-familia-ttf'
DEST=OUT/'TTF';DEST.mkdir(parents=True,exist_ok=True)
FILES={'regular':'Mont-Regular-PDF.otf','bold':'Mont-Bold-Reconstruida.otf','light':'Mont-ExtraLightDEMO.otf','heavy':'Mont-HeavyDEMO.otf'}
fonts={key:TTFont(SRC/file) for key,file in FILES.items()}
cmaps={key:font.getBestCmap() for key,font in fonts.items()}
faces={key:freetype.Face(str(SRC/file)) for key,file in FILES.items()}
for face in faces.values():face.set_char_size(0,1000*64,72,72)
rasters={key:ImageFont.truetype(str(SRC/file),256) for key,file in FILES.items()}
WEIGHTS=[('Hairline',50,12),('Thin',100,22),('ExtraLight',200,32.75),('Light',300,60),('Book',350,74),('Regular',400,87.73),('SemiBold',600,123),('Bold',700,152),('Heavy',800,195.4),('Black',900,227)]
ASCII_REAL=set(string.ascii_letters+string.digits+"'\"")
FAMILY='Mont Origens Reconstruida'

class ContourPen(BasePen):
 def __init__(self,gs=None):super().__init__(gs);self.contours=[];self.path=[];self.first=self.last=None
 def _moveTo(self,p):self.first=self.last=tuple(p);self.path=[]
 def _lineTo(self,p):
  p=tuple(p);a=self.last
  if math.dist(a,p)>.02:self.path.append((a,tuple(x+(y-x)/3 for x,y in zip(a,p)),tuple(x+2*(y-x)/3 for x,y in zip(a,p)),p))
  self.last=p
 def _curveToOne(self,a,b,c):self.path.append((self.last,tuple(a),tuple(b),tuple(c)));self.last=tuple(c)
 def _closePath(self):
  if math.dist(self.last,self.first)>.02:self._lineTo(self.first)
  if self.path:self.contours.append(self.path)
  self.path=[]
 def _endPath(self):self._closePath()

def outline(key,cp):
 gs=fonts[key].getGlyphSet();p=ContourPen(gs);gs[cmaps[key][cp]].draw(p);return p.contours

def width(key,cp):return fonts[key]['hmtx'][cmaps[key][cp]][0]
def box(cs):
 p=[p for c in cs for s in c for p in s]
 return (min(x for x,y in p),min(y for x,y in p),max(x for x,y in p),max(y for x,y in p)) if p else (0,0,0,0)
def bezier(s,t):return tuple((1-t)**3*s[0][i]+3*t*(1-t)**2*s[1][i]+3*t*t*(1-t)*s[2][i]+t**3*s[3][i] for i in [0,1])
def area(c):
 p=[bezier(s,t/4) for s in c for t in range(4)]
 return sum(p[i][0]*p[(i+1)%len(p)][1]-p[(i+1)%len(p)][0]*p[i][1] for i in range(len(p)))/2

def morph(a,b,t):
 if len(a)!=len(b):return None
 rest=list(b);result=[]
 for ca in sorted(a,key=lambda c:abs(area(c)),reverse=True):
  choices=[]
  for i,cb in enumerate(rest):
   if len(ca)!=len(cb):continue
   if area(ca)*area(cb)<0:cb=[(s[3],s[2],s[1],s[0]) for s in cb[::-1]]
   for shift in range(len(cb)):
    rotated=cb[shift:]+cb[:shift]
    cost=sum((pa[0]-pb[0])**2+(pa[1]-pb[1])**2 for sa,sb in zip(ca,rotated) for pa,pb in zip(sa,sb))
    choices.append((cost,i,rotated))
  if not choices:return None
  _,i,cb=min(choices,key=lambda x:x[0]);rest.pop(i)
  contour=[tuple(tuple((1-t)*pa[axis]+t*pb[axis] for axis in [0,1]) for pa,pb in zip(sa,sb)) for sa,sb in zip(ca,cb)]
  if area(contour)*area(ca)<=0 or abs(area(contour))<1:return None
  result.append(contour)
 return result

def fit(cs,target):
 b=box(cs)
 if b[2]<=b[0] or b[3]<=b[1]:return cs
 sx=max(1,target[2]-target[0])/(b[2]-b[0]);sy=max(1,target[3]-target[1])/(b[3]-b[1])
 return [[tuple(((x-b[0])*sx+target[0],(y-b[1])*sy+target[1]) for x,y in seg) for seg in c] for c in cs]

stroke_cache={}
def stroke(key,cp):
 k=(key,cp)
 if k not in stroke_cache:
  m=rasters[key].getmask(chr(cp),mode='L')
  if not m.size[0] or not m.size[1]:return 0
  a=np.asarray(m,dtype=np.uint8).reshape((m.size[1],m.size[0]))>127
  d=distance_transform_edt(np.pad(a,2))
  peaks=d[(d>0.7)&(d>=maximum_filter(d,size=3))]
  stroke_cache[k]=float(np.median(peaks)*2*1000/256) if len(peaks) else 10
 return stroke_cache[k]

def offset(key,cp,strength):
 face=faces[key];face.load_char(chr(cp),freetype.FT_LOAD_NO_HINTING|freetype.FT_LOAD_NO_BITMAP)
 o=face.glyph.outline
 if not o.n_points:return []
 error=freetype.FT_Outline_EmboldenXY(byref(o._FT_Outline),round(strength*64),round(strength*64))
 if error:raise RuntimeError((key,cp,error))
 p=ContourPen()
 def point(q):return (q.x/64,q.y/64)
 def move(q,context):
  if p.path:p.closePath()
  p.moveTo(point(q))
 o.decompose(move_to=move,line_to=lambda q,c:p.lineTo(point(q)),cubic_to=lambda a,b,c,ctx:p.curveTo(point(a),point(b),point(c)),conic_to=lambda a,b,c:p.qCurveTo(point(a),point(b)))
 if p.path:p.closePath()
 return p.contours

codes=sorted(cmaps['bold'])
original={key:{cp:outline(key,cp) for cp in codes if cp in cmap} for key,cmap in cmaps.items()}
ASCII_REAL={chr(cp) for cp in range(33,127) if cp in original['light'] and cp in original['heavy'] and len(original['light'][cp])<6 and len(original['heavy'][cp])<6}
regular={};regular_width={}
for cp in codes:
 if cp in original['regular']:
  regular[cp]=original['regular'][cp];regular_width[cp]=width('regular',cp)
 else:
  s=stroke('bold',cp);delta=max(3,s*87.73/152)-s
  regular[cp]=fit(offset('bold',cp,delta),box(original['bold'][cp]));regular_width[cp]=width('bold',cp)

required=string.ascii_letters+string.digits+string.punctuation+' áéíóúàâêôãõçÁÉÍÓÚÀÂÊÔÃÕÇªº€£¥©®™°–—…“”‘’'
assert all(ord(ch) in codes for ch in required)
records=[]
for label,weight,target_stem in WEIGHTS:
 shapes={};advances={};methods=Counter()
 for cp in codes:
  ch=chr(cp);a=regular[cp];b=original['bold'][cp]
  if weight==400:
   cs=a;advance=regular_width[cp];method='Regular master'
  elif weight==700:
   cs=b;advance=width('bold',cp);method='Approved reconstructed Bold master'
  elif ch in ASCII_REAL and weight==200:
   cs=original['light'][cp];advance=width('light',cp);method='Supplied ExtraLight outline'
  elif ch in ASCII_REAL and weight==800:
   cs=original['heavy'][cp];advance=width('heavy',cp);method='Supplied Heavy outline'
  else:
   if ch in ASCII_REAL and target_stem<87.73:
    low=original['light'][cp];high=a;t=(target_stem-32.75)/(87.73-32.75)
    lo_advance=width('light',cp);hi_advance=regular_width[cp]
   elif ch in ASCII_REAL and target_stem>152:
    low=b;high=original['heavy'][cp];t=(target_stem-152)/(195.4-152)
    lo_advance=width('bold',cp);hi_advance=width('heavy',cp)
   else:
    low=a;high=b;t=(target_stem-87.73)/(152-87.73)
    lo_advance=regular_width[cp];hi_advance=width('bold',cp)
   advance=max(80,round((1-t)*lo_advance+t*hi_advance))
   cs=morph(low,high,t) if 0<=t<=1 else None;method='Interpolated contours'
   if cs is None:
    if ch in ASCII_REAL and target_stem<32.75:key='light';master_stem=32.75
    elif ch in ASCII_REAL and target_stem>195.4:key='heavy';master_stem=195.4
    elif target_stem>152:key='bold';master_stem=152
    else:key='regular' if cp in cmaps['regular'] else 'bold';master_stem=87.73 if key=='regular' else 152
    measured=stroke(key,cp)
    strength=max(2.5,measured*target_stem/master_stem)-measured
    target=tuple((1-t)*x+t*y for x,y in zip(box(low),box(high)))
    if target_stem>195.4:
     source_box=box(original[key][cp]);growth=(target_stem-master_stem)*.035
     target=(source_box[0]-growth,source_box[1]-growth,source_box[2]+growth,source_box[3]+growth)
     # The straight I provides a measurable reference for actual stem weights.
     if ch=='I':target=(source_box[0],source_box[1],source_box[0]+target_stem,source_box[3])
     advance=width(key,cp)+round((target_stem-master_stem)*.45)
    cs=fit(offset(key,cp,strength),target);method='Adaptive vector reconstruction'
  shapes[cp]=cs;advances[cp]=advance;methods[method]+=1
 for italic in [False,True]:
  style=label+(' Italic' if italic else '')
  slug=label+('Italic' if italic else '')
  cmap={cp:('space' if cp==32 else f'uni{cp:04X}') for cp in codes}
  order=['.notdef']+list(cmap.values());glyf={};metrics={}
  source_notdef=fonts['bold'].getGlyphSet()['.notdef']
  glyph_pen=TTGlyphPen(None);conversion=Cu2QuPen(glyph_pen,.25,reverse_direction=True)
  source_notdef.draw(conversion);glyf['.notdef']=glyph_pen.glyph();metrics['.notdef']=(600,60)
  slant=math.tan(math.radians(11.31)) if italic else 0
  for cp,name in cmap.items():
   pen=TTGlyphPen(None);converted=Cu2QuPen(pen,.25,reverse_direction=True)
   draw=TransformPen(converted,(1,0,slant,1,0,0)) if italic else converted
   for contour in shapes[cp]:
    draw.moveTo(contour[0][0])
    for segment in contour:draw.curveTo(*segment[1:])
    draw.closePath()
   glyph=pen.glyph();glyf[name]=glyph
   points=[(x+slant*y,y) for c in shapes[cp] for seg in c for x,y in seg]
   metrics[name]=(advances[cp],math.floor(min(x for x,y in points)) if points else 0)
  fb=FontBuilder(1000,isTTF=True);fb.setupGlyphOrder(order);fb.setupCharacterMap(cmap);fb.setupGlyf(glyf)
  metrics={name:(advance,getattr(glyf[name],'xMin',0)) for name,(advance,lsb) in metrics.items()}
  fb.setupHorizontalMetrics(metrics)
  fb.setupHorizontalHeader(ascent=1050,descent=-350,lineGap=0,caretSlopeRise=1000,caretSlopeRun=round(slant*1000))
  linked=weight in [400,700]
  legacy_family=FAMILY if linked else FAMILY+' '+label
  legacy_style=('Bold Italic' if italic else 'Bold') if weight==700 else ('Italic' if italic else 'Regular')
  fb.setupNameTable({'familyName':legacy_family,'styleName':legacy_style,'typographicFamily':FAMILY,'typographicSubfamily':style,'fullName':FAMILY+' '+style,'psName':'MontOrigensRebuilt-'+slug,'uniqueFontIdentifier':'MontOrigensRebuilt-'+slug+'-1.0','version':'Version 1.000; reconstructed family','copyright':'Original font designs Copyright Fontfabric. Reconstruction and variations from user-provided sources for Origens.','description':'Reconstructed approximation for Origens; not the original Mont family. Weight contours interpolated or reconstructed. Italic variants are oblique constructions. Cubic source outlines converted to quadratic TrueType curves.'})
  bold_flag=weight==700
  selection=(1 if italic else 0)|(32 if bold_flag else 0)
  if not italic and not bold_flag:selection|=64
  fb.setupOS2(sTypoAscender=1050,sTypoDescender=-350,sTypoLineGap=0,usWinAscent=1100,usWinDescent=400,usWeightClass=weight,usWidthClass=5,fsType=4,fsSelection=selection,sxHeight=540,sCapHeight=700)
  fb.setupPost(italicAngle=-11.31 if italic else 0,underlinePosition=-120,underlineThickness=max(12,round(target_stem*.2)))
  fb.setupMaxp();fb.font['head'].macStyle=(1 if bold_flag else 0)|(2 if italic else 0)
  fb.font['head'].created=fonts['bold']['head'].created;fb.font['head'].modified=fonts['bold']['head'].modified;fb.font.recalcTimestamp=False
  gasp=newTable('gasp');gasp.version=1;gasp.gaspRange={65535:0x000f};fb.font['gasp']=gasp
  path=DEST/f'MontOrigens-{slug}.ttf';fb.save(path)
  check=TTFont(path,checkChecksums=2)
  assert check.sfntVersion=='\x00\x01\x00\x00' and 'glyf' in check and 'loca' in check and 'CFF ' not in check
  assert check.getBestCmap()==cmap
  engine=freetype.Face(str(path));engine.set_pixel_sizes(0,72)
  for ch in required:
   assert engine.get_char_index(ord(ch))>0,(style,ch)
   engine.load_char(ch,freetype.FT_LOAD_NO_HINTING)
  i_glyph=check['glyf'][cmap[ord('I')]]
  record={'file':path.name,'style':style,'weight':weight,'italic':italic,'glyphs':len(order),'unicode_characters':len(cmap),'I_outline_width':i_glyph.xMax-i_glyph.xMin,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'outline_hash':hashlib.sha256(check.getTableData('glyf')).hexdigest(),'methods':dict(methods)}
  records.append(record);print(json.dumps({k:record[k] for k in ['file','weight','glyphs','I_outline_width']}),flush=True)
assert len(records)==20 and len({r['outline_hash'] for r in records})==20
roman=[r for r in records if not r['italic']]
assert all(a['I_outline_width']<b['I_outline_width'] for a,b in zip(roman,roman[1:])),roman
sources={FILES[k]:hashlib.sha256((SRC/FILES[k]).read_bytes()).hexdigest() for k in FILES}
(OUT/'verificacao.json').write_text(json.dumps({'family':FAMILY,'sources':sources,'faces':records,'unicode_characters':len(codes),'quadratic_conversion_tolerance_font_units':.25,'italic_construction_degrees':11.31},ensure_ascii=False,indent=2)+'\n')
regular_font=ImageFont.truetype(str(DEST/'MontOrigens-Regular.ttf'),25)
for italic in [False,True]:
 im=Image.new('RGB',(1800,1480),'#f4f1eb');d=ImageDraw.Draw(im)
 title='MONT ORIGENS / FAMÍLIA RECONSTRUÍDA'+(' / ITÁLICOS' if italic else '')
 d.text((50,35),title,font=regular_font,fill='#181818')
 y=120
 for label,weight,_ in WEIGHTS:
  filename=f'MontOrigens-{label}'+('Italic' if italic else '')+'.ttf'
  d.text((50,y+20),label,font=regular_font,fill='#181818')
  sample=ImageFont.truetype(str(DEST/filename),62)
  text='Quem peleia — 123 & @'
  assert d.textbbox((290,y),text,font=sample)[2]<1750
  d.text((290,y),text,font=sample,fill='#181818');y+=127
 im.save(OUT/('previa-italicos.png' if italic else 'previa-pesos.png'))
im=Image.new('RGB',(1800,1080),'#f4f1eb');d=ImageDraw.Draw(im)
d.text((50,35),'MONT ORIGENS / ACENTOS E SÍMBOLOS / TTF',font=regular_font,fill='#181818')
samples=[('Regular','Não tá morto — quem peleia!',76),('Bold','Não tá morto — quem peleia!',76),('Heavy','Não tá morto — quem peleia!',76),('Bold','Á É Í Ó Ú À Â Ê Ô Ã Õ Ç / á é í ó ú à â ê ô ã õ ç',40),('Bold','0123456789  1º  2ª  Nº  35°C',52),('Bold','! " # $ % & \' ( ) * + , - . / : ; < = > ? @',45),('Bold','[ \\ ] ^ _ ` { | } ~  € £ ¥ © ® ™',49)]
y=120
for label,text,size in samples:
 d.text((50,y),label,font=regular_font,fill='#181818')
 d.text((245,y-10),text,font=ImageFont.truetype(str(DEST/f'MontOrigens-{label}.ttf'),size),fill='#181818');y+=130
im.save(OUT/'previa-caracteres.png')
(OUT/'LEIA-ME.txt').write_text('''MONT ORIGENS — FAMÍLIA RECONSTRUÍDA EM TTF

20 fontes TrueType: Hairline, Thin, ExtraLight, Light, Book, Regular,
SemiBold, Bold, Heavy e Black, cada uma em versão normal e itálica.

Família exibida nos aplicativos: Mont Origens Reconstruida.
Os arquivos TTF estão na pasta TTF. Abra-os para instalar no seu sistema.
Os nomes tipográficos e os vínculos Regular/Bold/Italic foram configurados.

Esta é uma família reconstruída a partir dos arquivos fornecidos pelo usuário,
não o pacote original comercial da Mont. A Bold normal preserva a reconstrução
aprovada no editor. Os demais pesos possuem contornos interpolados ou ajustados.
Os itálicos foram construídos por inclinação de 11,31 graus; não são os desenhos
itálicos originais completos da Mont.

Cada arquivo contém 408 caracteres Unicode: ASCII completo, acentos de português,
aspas, ordinais, moedas e outros símbolos presentes na base reconstruída.
Não é uma cobertura de todas as línguas ou de todos os símbolos Unicode.
Não inclui as tabelas originais completas de kerning, ligaduras ou fonte variável.
As curvas cúbicas da base foram convertidas em curvas quadráticas TrueType.

Veja previa-pesos.png, previa-italicos.png e previa-caracteres.png para conferir
a família. O manifesto verificacao.json registra pesos, caracteres e hashes.
O script scripts/build-mont-family-ttf.py reproduz a geração no projeto.
''')
archive=OUT.parent/'Mont-Origens-Familia-TTF.zip'
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as z:
 for file in sorted(OUT.rglob('*')):
  if file.is_file():z.write(file,arcname=str(file.relative_to(OUT)))
print('ARCHIVE',archive,'bytes',archive.stat().st_size,flush=True)
