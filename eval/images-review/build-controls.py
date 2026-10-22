"""Post-review visual counterbalance probe, Pillow==12.2.0, no external images.
Same words and same box dimensions per family; layout and color fully crossed.
The arrow-free boxes probe physical arrangement, not workflow semantics.
"""
from pathlib import Path
import json,hashlib,textwrap
from PIL import Image,ImageDraw,ImageFont
ROOT=Path(__file__).resolve().parents[2]; OUT=ROOT/'eval/images-review'; OLD=ROOT/'eval/images'
old=json.loads((OLD/'manifest.json').read_text())['figures']
def sha(b): return hashlib.sha256(b).hexdigest()
def save(name,data):(OUT/name).write_text(json.dumps(data,indent=2)+'\n')
font=ImageFont.load_default(size=24); head=ImageFont.load_default(size=30)
colors={'blue':('#dbeafe','#2563eb'),'orange':('#ffedd5','#c2410c')}
layouts={'column':[(384,190),(384,330),(384,470),(384,610)],'diamond':[(384,180),(200,370),(568,370),(384,590)]}
titles=['Dense retrieval','Reranking','Context assembly','Grounded generation','Incremental rendering','State continuity']
figures=[]; questions=[]
for family_index,(group,title) in enumerate(zip(['doc-02','doc-04','doc-06','doc-08','doc-10','doc-12'],titles)):
    original=next(f for f in old if f['group']==group and f['id'].endswith('-a'))
    nodes=original['render']['nodes']; visible=[title,*nodes]
    variants=[(c,l) for c in colors for l in layouts]
    # Rotate the ID-to-style relation across source families. All four exact
    # style queries per family still make any fixed tie winner correct 1/4.
    rotated=variants[family_index%4:]+variants[:family_index%4]
    for variant_index,(color,layout) in enumerate(rotated):
        ident=f'control-{family_index+1:02d}-{variant_index+1}'
        im=Image.new('RGB',(768,768),'#f8fafc');d=ImageDraw.Draw(im)
        d.text((384,65),title,font=head,fill='#0f172a',anchor='mm')
        fill,stroke=colors[color]
        for (x,y),label in zip(layouts[layout],nodes):
            d.rounded_rectangle((x-143,y-47,x+143,y+47),radius=12,fill=fill,outline=stroke,width=3)
            lines=textwrap.wrap(label,21)
            for j,line in enumerate(lines): d.text((x,y+(j-(len(lines)-1)/2)*27),line,font=font,fill='#0f172a',anchor='mm')
        name=f'assets/{ident}.png';im.save(OUT/name,optimize=True)
        figures.append({'id':ident,'family':group,'title':title,'image':name,'imageSha256':sha((OUT/name).read_bytes()),'source':original['source'],'sourceSha256':original['sourceSha256'],'color':color,'layout':layout,'visibleText':visible,'sourceFigure':original['id'],'width':768,'height':768})
    local=[f for f in figures if f['family']==group]
    def query(suffix,kind,text,allowed):
        questions.append({'id':f'{group}-{suffix}','family':group,'kind':kind,'question':text,'goldenImageIds':[f['id'] for f in local if allowed(f)]})
    for color in colors:
        for layout in layouts:
            position='a vertical column' if layout=='column' else 'a diamond'
            query(f'{color}-{layout}','conjunction',f'Find the {title.lower()} diagram with {color} boxes arranged in {position}.',lambda f,c=color,l=layout:f['color']==c and f['layout']==l)
    for color in colors:query(color,'color',f'Find the {title.lower()} diagram with {color} boxes.',lambda f,c=color:f['color']==c)
    for layout in layouts:
        position='a vertical column' if layout=='column' else 'a diamond'
        query(layout,'layout',f'Find the {title.lower()} diagram with boxes arranged in {position}.',lambda f,l=layout:f['layout']==l)
    query('topic','topic',f'Find a {title.lower()} diagram.',lambda f:True)
# Correct the v1 diagram's misleading serial placement of "Original intent".
# Separate output ID and path: never overwrite any frozen image/model input.
im=Image.new('RGB',(768,768),'#f8fafc');d=ImageDraw.Draw(im)
d.text((384,60),'Query transformation',font=head,fill='#0f172a',anchor='mm')
centers=[(384,170),(195,340),(573,340),(195,505),(384,665)]
labels=['Original question','Query rewrite','Original retrieval','Rewritten retrieval','Fused candidates']
for a,b in [(0,1),(0,2),(1,3),(3,4),(2,4)]:
 x,y=centers[a];u,v=centers[b];d.line([(x,y+40),(u,v-40)],fill='#475569',width=4);d.polygon([(u,v-40),(u-7,v-54),(u+7,v-54)],fill='#475569')
for (x,y),label in zip(centers,labels):
 d.rounded_rectangle((x-143,y-40,x+143,y+40),radius=10,fill='#dbeafe',outline='#2563eb',width=3)
 for j,line in enumerate(textwrap.wrap(label,21)):d.text((x,y+(j-(len(textwrap.wrap(label,21))-1)/2)*27),line,font=font,fill='#0f172a',anchor='mm')
im.save(OUT/'corrections/query-transformation.png',optimize=True)
save('manifest.json',{'version':'image-review-controls-1','purpose':'post-hoc diagnostic; not a fresh effectiveness benchmark','figures':figures})
save('questions.json',{'version':'image-review-questions-1','language':'en','questions':questions})
print(json.dumps({'images':len(figures),'queries':len(questions)}))
