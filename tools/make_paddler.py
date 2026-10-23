"""Builds assets/paddler.glb: a fictional, athletic young man from the MakeHuman base mesh (CC0).

Downloads the MakeHuman base mesh, skeleton and weights (github.com/makehumancommunity/makehuman)
and the morph targets (the `makehuman` package on PyPI), blends the targets into one body, cuts the
skeleton down to the bones the game animates and writes a skinned glTF binary.

    python3 tools/make_paddler.py [cache_dir]

Vertex colour COLOR_0 is not a colour but a mask the game turns into an outfit:
r = shirt, g = shorts, b = hair. Everything else is skin.
"""
import io, json, struct, sys, urllib.request, zipfile, os
import numpy as np

RAW = 'https://raw.githubusercontent.com/makehumancommunity/makehuman/master/makehuman/data/'
WHEEL = ('https://files.pythonhosted.org/packages/52/7b/d3d997e4b8ee3b16af4d5e9ff5994af82c6467db18fa50e535bb057ff077/'
         'makehuman-1.3.2-py3-none-any.whl')
CACHE = sys.argv[1] if len(sys.argv) > 1 else '/tmp/makehuman-cache'
OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'paddler.glb')

# the body: young man, lean and muscular, mixed ancestry
MUSCLE = {'averagemuscle': 0.35, 'maxmuscle': 0.65}
WEIGHT = {'minweight': 0.55, 'averageweight': 0.45}
RACE = {'african': 0.3, 'asian': 0.4, 'caucasian': 0.3}

# bones the game drives; every other bone hands its weights to its nearest kept ancestor
KEEP = {'root', 'spine05', 'spine04', 'spine03', 'spine02', 'spine01', 'neck01', 'neck02', 'neck03', 'head',
        'pelvis.L', 'pelvis.R', 'upperleg01.L', 'upperleg01.R', 'upperleg02.L', 'upperleg02.R',
        'lowerleg01.L', 'lowerleg01.R', 'lowerleg02.L', 'lowerleg02.R', 'foot.L', 'foot.R'}
for s in 'LR':
    KEEP |= {f'clavicle.{s}', f'shoulder01.{s}', f'upperarm01.{s}', f'upperarm02.{s}', f'lowerarm01.{s}',
             f'lowerarm02.{s}', f'wrist.{s}'}
    KEEP |= {f'finger{f}-{j}.{s}' for f in range(1, 6) for j in range(1, 4)}
SHIRT = ('spine', 'clavicle', 'shoulder01', 'breast')
SHORTS = ('root', 'pelvis', 'upperleg01')
ARM = ('upperarm', 'lowerarm', 'wrist', 'finger', 'metacarpal')


def fetch(url, name):
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, name)
    if not os.path.exists(path):
        urllib.request.urlretrieve(url, path)
    return path


def load_obj(path):
    verts, faces, group = [], [], None
    for line in open(path):
        if line.startswith('v '):
            verts.append([float(x) for x in line.split()[1:4]])
        elif line.startswith('g '):
            group = line.split()[1]
        elif line.startswith('f '):
            faces.append((group, [int(p.split('/')[0]) - 1 for p in line.split()[1:]]))
    return np.array(verts), faces


def main():
    verts, faces = load_obj(fetch(RAW + '3dobjs/base.obj', 'base.obj'))
    skel = json.load(open(fetch(RAW + 'rigs/default.mhskel', 'default.mhskel')))
    weights = json.load(open(fetch(RAW + 'rigs/default_weights.mhw', 'default_weights.mhw')))['weights']
    with zipfile.ZipFile(fetch(WHEEL, 'makehuman.whl')) as zf:
        targets = np.load(io.BytesIO(zf.read('makehuman/data/targets.npz')), allow_pickle=True)

    def add(name, w):
        idx = targets[f'targets/macrodetails/{name}.index']
        verts[idx] += w * targets[f'targets/macrodetails/{name}.vector'].astype(np.float64) / 1000.0

    for m, wm in MUSCLE.items():
        for wt, ww in WEIGHT.items():
            add(f'universal-male-young-{m}-{wt}', wm * ww)
    for r, w in RACE.items():
        add(f'{r}-male-young', w)

    # joints are the centres of little helper cubes in the mesh
    joint = {k: verts[v].mean(0) for k, v in skel['joints'].items()}
    bones = skel['bones']
    order = []
    def visit(b):
        order.append(b)
        for c, d in bones.items():
            if d['parent'] == b:
                visit(c)
    visit('root')
    kept = [b for b in order if b in KEEP]
    bi = {b: i for i, b in enumerate(kept)}
    def owner(b):
        while b not in KEEP:
            b = bones[b]['parent']
        return b

    # keep the skin and the eyeballs; drop the other helper geometry
    keepf = [f for g, f in faces if g in ('body', 'helper-l-eye', 'helper-r-eye')]
    used = sorted({i for f in keepf for i in f})
    remap = {o: n for n, o in enumerate(used)}
    eye = np.zeros(len(verts), bool)
    for g, f in faces:
        if g in ('helper-l-eye', 'helper-r-eye'):
            eye[f] = True
    tris = []
    for f in keepf:
        f = [remap[i] for i in f]
        tris += [[f[0], f[1], f[2]]] + ([[f[0], f[2], f[3]]] if len(f) == 4 else [])
    tris = np.array(tris, np.uint16)

    # decimetres to metres, and turn round so the body faces -z (the bow); a half turn keeps the winding
    S = 0.1
    pos = verts[used] * S
    pos[:, 0] *= -1; pos[:, 2] *= -1
    jpos = {}
    for b in kept:
        p = joint[bones[b]['head']] * S
        jpos[b] = np.array([-p[0], p[1], -p[2]])

    # skin weights: merged into kept bones, best four per vertex
    n = len(used)
    acc = [dict() for _ in range(n)]
    mask = np.zeros((n, 3))
    for b, lst in weights.items():
        o = owner(b)
        for vi, w in lst:
            if vi in remap:
                j = remap[vi]
                acc[j][o] = acc[j].get(o, 0) + w
                if b.startswith(SHIRT): mask[j, 0] += w
                if b.startswith(SHORTS): mask[j, 1] += w
                if b.startswith(ARM): mask[j, 2] += w
    J = np.zeros((n, 4), np.uint8); W = np.zeros((n, 4), np.float32)
    for j, d in enumerate(acc):
        top = sorted(d.items(), key=lambda kv: -kv[1])[:4]
        s = sum(w for _, w in top) or 1
        for k, (b, w) in enumerate(top):
            J[j, k] = bi[b]; W[j, k] = w / s
        if not top:
            J[j, 0] = bi['head']; W[j, 0] = 1
    # a sleeveless top and shorts to mid thigh, cut on straight lines rather than by bone weight
    y = pos[:, 1]
    waist = jpos['spine05'][1] + 0.04
    thigh = (jpos['upperleg02.L'][1] * 2 + jpos['lowerleg01.L'][1]) / 3
    neck = jpos['neck01'][1] - 0.01
    arm = mask[:, 2]
    shirt = (y >= waist) & (y < neck) & (arm < 0.35)
    shorts = (y < waist) & (y > thigh) & (arm < 0.2)
    # short hair on the back and sides of the head, above the ears
    rel = pos - jpos['head']
    hair = (((rel[:, 1] > 0.1) & (rel[:, 2] > -0.06)) | ((rel[:, 1] > 0.04) & (rel[:, 2] > 0.02))) & (rel[:, 1] < 0.4) & ~eye[used] & ~shirt
    col = np.zeros((n, 4), np.float32); col[:, 3] = 1
    col[shirt, 0] = 1; col[shorts, 1] = 1; col[hair, 2] = 1
    col[eye[used]] = [0, 0, 0, 0]   # alpha 0 marks the eyes

    # smooth normals
    nrm = np.zeros_like(pos)
    a, b_, c = pos[tris[:, 0]], pos[tris[:, 1]], pos[tris[:, 2]]
    fn = np.cross(b_ - a, c - a)
    for k in range(3):
        np.add.at(nrm, tris[:, k], fn)
    nrm /= np.linalg.norm(nrm, axis=1, keepdims=True) + 1e-9

    write_glb(pos.astype(np.float32), nrm.astype(np.float32), col, J, W, tris, kept, bones, jpos)


def write_glb(pos, nrm, col, J, W, tris, kept, bones, jpos):
    blob = bytearray(); views = []; accessors = []
    def put(arr, target=None, ctype=5126, typ='VEC3', minmax=False):
        nonlocal blob
        while len(blob) % 4: blob.append(0)
        data = arr.tobytes()
        v = {'buffer': 0, 'byteOffset': len(blob), 'byteLength': len(data)}
        if target: v['target'] = target
        views.append(v); blob += data
        acc = {'bufferView': len(views) - 1, 'componentType': ctype, 'count': len(arr), 'type': typ}
        if minmax:
            acc['min'] = arr.min(0).tolist(); acc['max'] = arr.max(0).tolist()
        accessors.append(acc)
        return len(accessors) - 1
    P = put(pos, 34962, minmax=True)
    N = put(nrm, 34962)
    C = put(col, 34962, typ='VEC4')
    Jn = put(J, 34962, ctype=5121, typ='VEC4')
    Wn = put(W, 34962, typ='VEC4')
    I = put(tris.reshape(-1), 34963, ctype=5123, typ='SCALAR')
    ibm = np.zeros((len(kept), 16), np.float32)
    for i, b in enumerate(kept):
        m = np.eye(4); m[:3, 3] = -jpos[b]
        ibm[i] = m.T.reshape(-1)   # column-major
    IB = put(ibm, ctype=5126, typ='MAT4')
    nodes = [{'name': 'body', 'mesh': 0, 'skin': 0}]
    base = 1
    def up(b):   # nearest kept ancestor
        p = bones[b]['parent']
        while p is not None and p not in jpos:
            p = bones[p]['parent']
        return p
    for i, b in enumerate(kept):
        p = up(b)
        rel = jpos[b] - (jpos[p] if p else 0)
        nodes.append({'name': b.replace('.', '_'), 'translation': [float(x) for x in rel]})   # glTF loaders strip dots
    for i, b in enumerate(kept):
        ch = [base + kept.index(c) for c in kept if up(c) == b]
        if ch: nodes[base + i]['children'] = ch
    gltf = {
        'asset': {'version': '2.0', 'generator': 'vaa tools/make_paddler.py',
                  'copyright': 'Body from MakeHuman (CC0), makehumancommunity.org'},
        'scene': 0, 'scenes': [{'nodes': [0, base]}],
        'nodes': nodes,
        'meshes': [{'name': 'paddler', 'primitives': [{'attributes': {'POSITION': P, 'NORMAL': N, 'COLOR_0': C, 'JOINTS_0': Jn, 'WEIGHTS_0': Wn}, 'indices': I}]}],
        'skins': [{'joints': [base + i for i in range(len(kept))], 'inverseBindMatrices': IB, 'skeleton': base}],
        'accessors': accessors, 'bufferViews': views, 'buffers': [{'byteLength': len(blob)}],
    }
    js = json.dumps(gltf, separators=(',', ':')).encode()
    while len(js) % 4: js += b' '
    while len(blob) % 4: blob.append(0)
    out = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(blob))
    out += struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(blob), 0x004E4942) + bytes(blob)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    open(OUT, 'wb').write(out)
    print('wrote', OUT, len(out) // 1024, 'KB,', len(pos), 'vertices,', len(tris), 'triangles,', len(kept), 'bones')


if __name__ == '__main__':
    main()
