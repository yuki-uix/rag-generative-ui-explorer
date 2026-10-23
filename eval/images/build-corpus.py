"""Repository-authored diagrams; no downloaded paper figures or generated captions.
Rebuild with Python + Pillow==12.2.0. Source snapshots are exact repository files.
"""
from pathlib import Path
import hashlib, json, math, textwrap
from PIL import Image, ImageDraw, ImageFont, __version__
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'eval/images'
def digest(b): return hashlib.sha256(b).hexdigest()
def write(name,x): (OUT/name).write_text(json.dumps(x,indent=2,ensure_ascii=False)+'\n')
# Each pair illustrates two different views from one note. Text arm deliberately
# shares the note body, never the labels below or the query/answer annotations.
SPECS=[
('rag/sparse-retrieval','Sparse retrieval',['Query terms','Inverted index','Posting lists','BM25 ranking'],['Query terms','Term frequency','Document length','BM25 score'],'Inverted index','Document length','Find the illustration of looking up literal words in postings before ranking documents.'),
('rag/dense-retrieval','Dense retrieval',['Passages','Passage encoder','Stored vectors','Nearest neighbors'],['Query and passage','Question encoder','Passage encoder','Vector similarity'],'Stored vectors','Question encoder','Find the illustration of precomputing document representations for nearest-neighbor lookup.'),
('rag/candidate-fusion','Candidate fusion',['Retriever outputs','Rank positions','Reciprocal ranks','Merged ranking'],['Ranked candidates','Lexical list','Dense list','RRF combination'],'Reciprocal ranks','RRF combination','Find the illustration that combines retrieval positions instead of incomparable raw scores.'),
('rag/reranking','Reranking',['Retrieved candidates','Query passage pairs','Cross encoder','Reordered top K'],['Candidate pool','Relevant passages','Irrelevant passages','Reordered subset'],'Cross encoder','Reordered subset','Find the illustration of scoring query-document pairs after initial retrieval.'),
('rag/ingestion-and-chunking','Ingestion and chunking',['Source document','Section boundaries','Text chunks','Stable identifiers'],['Document metadata','Source title','Section location','Addressable chunks'],'Stable identifiers','Section location','Find the illustration of splitting documents into addressable units before indexing.'),
('rag/context-assembly','Context assembly',['Retrieved passages','Deduplicate','Token budget','Ordered context'],['Evidence context','Source identifiers','Passage boundaries','Traceable prompt'],'Deduplicate','Passage boundaries','Find the illustration of removing repeated passages and fitting evidence into a limited prompt.'),
('rag/query-transformation','Query transformation',['User question','Query rewrite','Retrieve passages','Original intent'],['Question input','Decomposition','Expansion','Retrieval queries'],'Query rewrite','Decomposition','Find the illustration of reformulating the question before searching while preserving its intent.'),
('rag/grounded-generation','Grounded generation',['Retrieved evidence','Generate claims','Check support','Cited answer'],['Generated statement','Extracted words','Inferred claim','Evidence reference'],'Check support','Inferred claim','Find the illustration of checking that generated statements are supported before publishing an answer.'),
('generative-ui/declarative-ui-schemas','Declarative UI schemas',['Model intent','Schema validation','Known components','Rendered interface'],['UI declaration','Allowed types','Required fields','Validated structure'],'Known components','Required fields','Find the illustration of validating a component specification before rendering a trusted interface.'),
('generative-ui/streaming-and-incremental-rendering','Incremental rendering',['Partial JSON','Buffer structure','Validate component','Render complete card'],['Streaming response','Progress status','Validated content','Incremental display'],'Buffer structure','Progress status','Find the illustration of buffering incomplete structure before displaying a complete validated component.'),
('intersection/field-level-citation','Field level citations',['Factual field','Evidence identifier','Source passage','Check attribution'],['Knowledge card','First factual field','Second factual field','Individual citations'],'Check attribution','Second factual field','Find the illustration that traces a single factual field to its own supporting passage.'),
('generative-ui/state-continuity','State continuity',['First interface','User selection','Next response','Preserved state'],['State categories','Conversation state','UI state','Distinct ownership'],'User selection','UI state','Find the illustration of carrying a user selection across successive generated interfaces.'),
]
font=ImageFont.load_default(size=24)
small=ImageFont.load_default(size=20)
titlefont=ImageFont.load_default(size=30)
figures=[]; questions=[]
for i,(path,title,a,b,term_a,term_b,concept) in enumerate(SPECS):
    group=f'doc-{i+1:02d}'; split='development' if i%2==0 else 'evaluation'
    source=(ROOT/'knowledge'/f'{path}.md').read_bytes()
    source_name=f'sources/{group}.md'; (OUT/source_name).write_bytes(source)
    for variant,nodes in [('a',a),('b',b)]:
        ident=f'figure-{i+1:02d}-{variant}'
        image=Image.new('RGB',(768,768),'#f8fafc'); d=ImageDraw.Draw(image)
        d.text((384,65),title,fill='#0f172a',font=titlefont,anchor='mm')
        if variant=='a': centers=[(384,190),(384,330),(384,470),(384,610)]; edges=[(0,1),(1,2),(2,3)]; fill='#dbeafe'; outline='#2563eb'
        else: centers=[(384,180),(200,370),(568,370),(384,590)]; edges=[(0,1),(0,2),(1,3),(2,3)]; fill='#ffedd5'; outline='#c2410c'
        for start,end in edges:
            x,y=centers[start]; u,v=centers[end]; dx=u-x;dy=v-y;l=math.hypot(dx,dy); ux,uy=dx/l,dy/l
            p=(x+ux*60,y+uy*60); q=(u-ux*63,v-uy*63)
            d.line([p,q],fill='#475569',width=5)
            d.polygon([q,(q[0]-ux*16-uy*8,q[1]-uy*16+ux*8),(q[0]-ux*16+uy*8,q[1]-uy*16-ux*8)],fill='#475569')
        for (x,y),label in zip(centers,nodes):
            d.rounded_rectangle((x-143,y-47,x+143,y+47),radius=12,fill=fill,outline=outline,width=3)
            lines=textwrap.wrap(label,width=21)
            for j,line in enumerate(lines): d.text((x,y+(j-(len(lines)-1)/2)*27),line,fill='#0f172a',font=font,anchor='mm')
        filename=f'assets/{ident}.png'; image.save(OUT/filename,optimize=True)
        figures.append({'id':ident,'group':group,'split':split,'image':filename,'imageSha256':digest((OUT/filename).read_bytes()),'width':768,'height':768,'source':source_name,'sourceSha256':digest(source),'sourcePath':f'knowledge/{path}.md','sourceCommit':'37813a283f9f0a2f1adc7daa373e973b3a7a0332','authorship':'Repository-authored teaching diagram, not a figure from the cited papers','license':'MIT (repository-authored artwork and source notes)','render':{'layout':'vertical-chain' if variant=='a' else 'diamond-branches','nodes':nodes,'pillow':__version__}})
        questions.append({'id':f'{ident}-literal','group':group,'split':split,'category':'literal','question':f'Which {title.lower()} figure contains the label "{term_a if variant=="a" else term_b}"?','goldenImageIds':[ident],'rationale':f'The requested label is present in {ident}.'})
        q=concept if variant=='a' else f'Find the {title.lower()} diagram with orange boxes, two parallel branches and a merge at the bottom.'
        questions.append({'id':f'{ident}-'+('concept' if variant=='a' else 'layout'),'group':group,'split':split,'category':'concept' if variant=='a' else 'layout','question':q,'goldenImageIds':[ident],'rationale':'Concept flow in the vertical diagram.' if variant=='a' else 'The orange diamond layout is visible only in this diagram of this source group.'})
for i,q in enumerate(['Find a photograph of a cat sleeping on a keyboard.','Which diagram shows a Kubernetes pod autoscaler?','Find a line chart of GPU power consumption over time.','Which figure shows a speech synthesis codec waveform?']):
    questions.append({'id':f'negative-{i+1}','group':f'negative-{i+1}','split':'development' if i%2==0 else 'evaluation','category':'negative','question':q,'goldenImageIds':[],'rationale':'No image in this authored corpus depicts this request.'})
write('manifest.json',{'version':'image-corpus-1','author':'Codex assistant, authored for this repository','blind':False,'figures':figures})
write('questions.json',{'version':'image-questions-1','language':'en','author':'same assistant as corpus/harness; not independent or blind','questions':questions})
print(json.dumps({'figures':len(figures),'questions':len(questions),'pillow':__version__}))
