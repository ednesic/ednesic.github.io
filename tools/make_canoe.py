"""Builds assets/canoe.glb: a racing V1 (one-person va'a, no rudder) modelled in Blender.

    pip install bpy        # Blender as a Python module (5.1 or newer)
    python3 tools/make_canoe.py

The hull is lofted from cross sections (needle bow and stern, a low ridged deck that rises into a
hump around the cockpit), then the cockpit is cut into it as a tub down to the seat, so the paddler
sits inside the hull with the legs under the front deck. The ama, two curved carbon iakos with their
stanchions, the coaming and the seat pad are separate parts of the same model.

Units are metres, the origin is the waterline under the middle of the hull and in the game's frame
the bow points to -z and the ama is on the left (-x). Sizes match src/canoe.js (HULL 7.3, AMA_X -1.9)
and the seat at z = +0.55 used by src/render/models.js.

Materials are named so the game can paint each canoe: hull, deck, trim, cockpit, seat, carbon.
"""
import math, os
import bpy, bmesh

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'canoe.glb')

HULL, AMA_X = 7.3, -1.9
SEAT_Z, SEAT_H = 0.55, 0.07            # game z of the hips, height of the seat pad
COCKPIT = (SEAT_Z - 0.8, SEAT_Z + 0.26)   # game z of its front and back ends


def smooth(e0, e1, x):
    t = min(1.0, max(0.0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)


# --- materials ---------------------------------------------------------------------------------
def material(name, rgb, rough):
    m = bpy.data.materials.new(name)
    bsdf = m.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = (*rgb, 1)
    bsdf.inputs['Roughness'].default_value = rough
    return m


# --- hull sections -----------------------------------------------------------------------------
class Hull:
    """Cross sections of a lofted hull along u (0 stern, 1 bow), in Blender axes (x right, y bow, z up)."""

    def __init__(self, length, beam, draft, sheer, crown, rocker, bow_up, stern_up, hump=None, fwd=0.0):
        self.L, self.B, self.D, self.S, self.C = length, beam, draft, sheer, crown
        self.rocker, self.bow_up, self.stern_up, self.hump, self.fwd = rocker, bow_up, stern_up, hump, fwd

    def y(self, u):
        return (u - 0.5) * self.L + self.fwd

    def half_beam(self, u):
        # fullest a little behind the middle, long fine entry at the bow
        p = u ** 1.12
        return self.B * math.sin(math.pi * p) ** (0.95 if u > 0.5 else 0.8)

    def bump(self, u):
        if not self.hump:
            return 0.0
        h, z0, z1 = self.hump
        gz = -self.y(u)   # back to the game's z
        return h * smooth(z0 - 0.8, z0 - 0.1, gz) * smooth(z1 + 0.6, z1 + 0.05, gz)

    def sheer(self, u):
        tip = self.bow_up * smooth(0.82, 1.0, u) ** 1.6 + self.stern_up * smooth(0.12, 0.0, u) ** 1.6
        return self.S * (0.75 + 0.25 * math.sin(math.pi * u)) + tip + self.bump(u)

    def keel(self, u):
        rise = self.rocker * (2 * u - 1) ** 2 + self.bow_up * 0.9 * smooth(0.86, 1.0, u) + self.stern_up * 0.9 * smooth(0.1, 0.0, u)
        return -self.D * math.sin(math.pi * u) ** 0.35 + rise

    def deck(self, u, x):
        """Deck height at x across the beam: a ridge down the middle with rounded gunwales."""
        b = max(1e-4, self.half_beam(u))
        t = min(1.0, abs(x) / b)
        return self.sheer(u) + self.C * (min(1.0, self.half_beam(u) / self.B) ** 0.5) * (1 - t ** 1.6)

    def ring(self, u, nb=14, nd=9):
        """Starboard half from the keel up the side and over the deck to the ridge, mirrored to port."""
        b, zk, zs = self.half_beam(u), self.keel(u), self.sheer(u)
        half = []
        for i in range(nb + 1):
            f = i / nb * math.pi / 2
            half.append((b * math.sin(f) ** 0.7, zs - (zs - zk) * math.cos(f) ** 1.25, 'hull'))
        for i in range(1, nd + 1):
            x = b * (1 - i / nd)
            half.append((x, self.deck(u, x), 'deck'))
        port = [(-x, z, k) for x, z, k in reversed(half[1:-1])]
        return half + port   # keel, starboard side, ridge, port deck, port side


def loft(name, hull, stations, mats):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    rings = []
    for i in range(stations + 1):
        # cosine spacing: more stations at the fine ends
        u = 0.5 - 0.5 * math.cos(math.pi * i / stations)
        if i in (0, stations):
            z = (hull.keel(u) + hull.sheer(u)) / 2
            rings.append([bm.verts.new((0.0, hull.y(u), z))])
            continue
        rings.append([(bm.verts.new((x, hull.y(u), z)), k) for x, z, k in hull.ring(u)])
    for i in range(stations):
        a, b = rings[i], rings[i + 1]
        if len(a) == 1 or len(b) == 1:
            tip, ring = (a[0], b) if len(a) == 1 else (b[0], a)
            n = len(ring)
            for j in range(n):
                v1, v2 = ring[j][0], ring[(j + 1) % n][0]
                f = bm.faces.new((tip, v1, v2) if len(a) == 1 else (tip, v2, v1))
                f.material_index = 1 if ring[j][1] == 'deck' and ring[(j + 1) % n][1] == 'deck' else 0
            continue
        n = len(a)
        for j in range(n):
            k = (j + 1) % n
            f = bm.faces.new((a[j][0], a[k][0], b[k][0], b[j][0]))
            f.material_index = 1 if a[j][1] == 'deck' and a[k][1] == 'deck' else 0
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    for m in mats:
        me.materials.append(m)
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    return ob


def cockpit_outline(n=48):
    """The opening seen from above: a long slot, widest at the hips, narrowing toward the knees."""
    front, back = -COCKPIT[0], -COCKPIT[1]   # Blender y
    pts = []
    for i in range(n):
        a = i / n * 2 * math.pi
        t = 0.5 - 0.5 * math.cos(a)            # 0 at the back end, 1 at the front end
        y = back + (front - back) * t
        w = 0.155 * (1 - 0.35 * smooth(0.35, 1.0, t)) * math.sin(math.pi * t) ** 0.35
        pts.append((w * math.sin(a), y))
    return pts


def prism(name, outline, z0, z1, mat):
    bm = bmesh.new()
    lo = [bm.verts.new((x, y, z0)) for x, y in outline]
    hi = [bm.verts.new((x, y, z1)) for x, y in outline]
    n = len(outline)
    bm.faces.new(list(reversed(lo)))
    bm.faces.new(hi)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((lo[i], lo[j], hi[j], hi[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    return ob


def tube(name, points, radius, mat, closed=False):
    cu = bpy.data.curves.new(name, 'CURVE')
    cu.dimensions = '3D'
    cu.bevel_depth = radius
    cu.bevel_resolution = 3
    cu.use_fill_caps = True
    sp = cu.splines.new('NURBS')
    sp.points.add(len(points) - 1)
    for p, co in zip(sp.points, points):
        p.co = (*co, 1)
    sp.order_u = 4
    sp.use_endpoint_u = not closed
    sp.use_cyclic_u = closed
    sp.resolution_u = 10
    ob = bpy.data.objects.new(name, cu)
    bpy.context.collection.objects.link(ob)
    cu.materials.append(mat)
    return ob


def apply_all(ob):
    bpy.context.view_layer.objects.active = ob
    for o in bpy.context.selected_objects:
        o.select_set(False)
    ob.select_set(True)
    if ob.type == 'CURVE':
        bpy.ops.object.convert(target='MESH')
    for m in list(ob.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)


def shade(ob, angle=38):
    bpy.context.view_layer.objects.active = ob
    for o in bpy.context.selected_objects:
        o.select_set(False)
    ob.select_set(True)
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(angle))


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    M = {
        'hull': material('hull', (0.8, 0.12, 0.1), 0.25),
        'deck': material('deck', (0.92, 0.92, 0.9), 0.3),
        'trim': material('trim', (0.05, 0.05, 0.06), 0.35),
        'cockpit': material('cockpit', (0.12, 0.13, 0.15), 0.6),
        'seat': material('seat', (0.18, 0.2, 0.22), 0.9),
        'carbon': material('carbon', (0.06, 0.06, 0.07), 0.3),
    }

    # main hull: 7.3 m, about 40 cm wide at the cockpit, 12 cm of draft
    hull = Hull(HULL, beam=0.2, draft=0.13, sheer=0.12, crown=0.05, rocker=0.05, bow_up=0.13, stern_up=0.06,
                hump=(0.09, COCKPIT[0], COCKPIT[1]))
    ob = loft('hull', hull, 140, [M['hull'], M['deck']])

    # the cockpit: a tub from the seat up through the deck, its floor edges rounded
    cut = prism('cut', cockpit_outline(), SEAT_H - 0.005, 0.8, M['cockpit'])
    bev = cut.modifiers.new('round', 'BEVEL')
    bev.width, bev.segments, bev.limit_method = 0.05, 4, 'ANGLE'
    apply_all(cut)
    b = ob.modifiers.new('cockpit', 'BOOLEAN')
    b.operation, b.object, b.solver = 'DIFFERENCE', cut, 'EXACT'
    b.material_mode = 'TRANSFER'
    apply_all(ob)
    bpy.data.objects.remove(cut)
    shade(ob)

    # coaming: a lip around the opening, following the deck
    rim = []
    for x, y in cockpit_outline(36):
        u = y / HULL + 0.5
        s = 1.06
        rim.append((x * s, y + (0.012 if y > 0 else -0.012), hull.deck(u, x * s) + 0.004))
    tube('coaming', rim, 0.013, M['trim'], closed=True)

    # seat pad on the floor of the tub
    seat_y = -(SEAT_Z + 0.05)
    pad = [(0.12 * math.cos(a), seat_y + 0.17 * math.sin(a)) for a in (i / 32 * 2 * math.pi for i in range(32))]
    seat = prism('seat', pad, SEAT_H - 0.004, SEAT_H + 0.022, M['seat'])
    bv = seat.modifiers.new('round', 'BEVEL')
    bv.width, bv.segments, bv.limit_method = 0.012, 2, 'ANGLE'
    apply_all(seat)
    shade(seat, 60)

    # ama: slim, upswept nose, rides alongside the cockpit
    ama_h = Hull(3.0, beam=0.08, draft=0.08, sheer=0.1, crown=0.04, rocker=0.08, bow_up=0.14, stern_up=0.03, fwd=-0.4)
    ama = loft('ama', ama_h, 80, [M['hull'], M['deck']])
    ama.location.x = AMA_X
    shade(ama)

    # iakos: carbon booms that sit on the deck ahead of and behind the cockpit, arch out over the
    # water and drop into stanchions on the ama
    for gz in (COCKPIT[0] - 0.35, COCKPIT[1] + 0.7):
        y = -gz
        u = y / HULL + 0.5
        top = hull.deck(u, 0.0)
        ua = (y + 0.4) / 3.0 + 0.5
        ama_top = ama_h.deck(ua, 0.0)
        pts = [(0.17, y, top + 0.0), (0.0, y, top + 0.03), (-0.45, y, top + 0.12), (-1.0, y, top + 0.2),
               (-1.5, y, top + 0.14), (AMA_X + 0.02, y, top + 0.04), (AMA_X, y, ama_top + 0.12), (AMA_X, y, ama_top)]
        t = tube('iako', pts, 0.024, M['carbon'])
        apply_all(t)
        shade(t, 50)
        # saddle where it is lashed to the deck
        saddle = prism('saddle', [(0.06 * math.cos(a) * 1.9, y + 0.06 * math.sin(a)) for a in (i / 20 * 2 * math.pi for i in range(20))],
                       top - 0.04, top + 0.012, M['carbon'])
        shade(saddle, 50)

    # one mesh per material is cheaper to draw: join everything
    for o in bpy.context.scene.objects:
        if o.type == 'CURVE':
            apply_all(o)
    objs = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    bpy.context.view_layer.objects.active = objs[0]
    for o in objs:
        o.select_set(True)
    bpy.ops.object.join()
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    objs[0].name = 'canoe'

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_apply=True, export_yup=True,
                              export_normals=True, export_texcoords=False, export_materials='EXPORT')
    print('wrote', os.path.normpath(OUT), os.path.getsize(OUT), 'bytes')


main()
