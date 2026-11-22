"""
Viking Loot – procedural 3D assets rendered to sprite sheets.

Builds every model from rounded primitives (no external assets), poses it frame by frame,
renders with a cel-shaded EEVEE look and packs the frames into PNG sheets under
public/assets/. Also writes src/game/assets.generated.ts so Phaser knows the frame layout.

Run (from the repo root):
  blender -b --factory-startup -P art-source/blender/render_assets.py            # everything
  blender -b --factory-startup -P art-source/blender/render_assets.py -- ragnar  # one subject

Style and palette follow ui-settings.md (§2, §3, §5).
"""
import bpy, bmesh, math, os, sys, json, warnings
from mathutils import Matrix, Vector, Euler
from bpy_extras.object_utils import world_to_camera_view
import numpy as np

# use_nodes is deprecated in Blender 5 (nodes are always on) but still needed on 4.x.
warnings.filterwarnings('ignore', category=DeprecationWarning)

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
PUBLIC = os.path.join(ROOT, 'public')
TMP = os.path.join(ROOT, 'art-source', 'renders')
MANIFEST_JSON = os.path.join(ROOT, 'art-source', 'manifest.json')
MANIFEST_TS = os.path.join(ROOT, 'src', 'game', 'assets.generated.ts')

# ---------------------------------------------------------------- palette (ui-settings.md §2)
P = {
    'red': '#D96B46', 'blue': '#458FC4', 'yellow': '#F0BD55',
    'green': '#78A48B', 'wood': '#8C624A', 'sand': '#F3E3C5',
    'wood_dark': '#5B3A20', 'wood_light': '#B9875A', 'ink': '#3B2414',
    'skin': '#F6C29A', 'skin_dark': '#E39F78', 'steel': '#A9B3BD', 'steel_dark': '#6C7680',
    'horn': '#F4E6C8', 'gold': '#F5C542', 'beard_red': '#D9532B', 'beard_grey': '#D8DBE0',
    'hair_blonde': '#F2C23A', 'pants': '#6B4A35', 'boot': '#4A2E1A', 'white': '#FFFFFF',
    'black': '#1D1410', 'cheek': '#F59B9B', 'sail_red': '#D8342B', 'sail_cream': '#F4EAD8',
    'dragon': '#D9A441', 'window': '#FFD36B', 'mouth': '#7A1F12',
    'beard_brown': '#7A4A2A', 'hair_dark': '#6B3A22', 'tarp': '#A89070', 'rope': '#D9B57A', 'stone': '#8E9196',
    # 0.4 – Isriket
    'ice': '#BFE8F7', 'ice_dark': '#78BCDD', 'cloak': '#3E7D6A', 'hair_red': '#B5532E',
    'snow': '#F1F6FA', 'snow_shade': '#D3E2EC',
    # 0.5 – Muspelheim
    'lava': '#F2642A', 'lava_hot': '#FFC23D', 'basalt': '#3B3536', 'ash': '#5E5553', 'soot': '#231E1F', 'raven': '#1E2128',
}
TEAM = {'ragnar': 'red', 'bjorn': 'blue', 'freja': 'yellow'}


def lin(h):
    h = h.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in c)


def shade(h, f):
    h = h.lstrip('#')
    c = [int(h[i:i + 2], 16) for i in (0, 2, 4)]
    c = [round(v + (255 - v) * f) if f >= 0 else round(v * (1 + f)) for v in c]
    return '#%02X%02X%02X' % tuple(c)


# ---------------------------------------------------------------- scene setup
def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    s = bpy.context.scene
    for eng in ('BLENDER_EEVEE', 'BLENDER_EEVEE_NEXT'):
        try:
            s.render.engine = eng
            break
        except TypeError:
            pass
    try:
        s.eevee.taa_render_samples = 16
    except AttributeError:
        pass
    s.render.film_transparent = True
    s.view_settings.view_transform = 'Standard'
    s.view_settings.look = 'None'
    s.render.image_settings.file_format = 'PNG'
    s.render.image_settings.color_mode = 'RGBA'
    s.render.resolution_percentage = 100
    w = bpy.data.worlds.new('World')
    s.world = w
    try:
        w.use_nodes = True
    except Exception:
        pass
    bg = w.node_tree.nodes.get('Background') or w.node_tree.nodes.new('ShaderNodeBackground')
    bg.inputs['Color'].default_value = (0.32, 0.35, 0.42, 1)
    bg.inputs['Strength'].default_value = 1.0
    out = w.node_tree.nodes.get('World Output') or w.node_tree.nodes.new('ShaderNodeOutputWorld')
    w.node_tree.links.new(bg.outputs[0], out.inputs['Surface'])
    MATS.clear()
    lights()
    return s


def lights():
    def sun(name, direction, strength, color=(1, 1, 1)):
        d = bpy.data.lights.new(name, 'SUN')
        d.energy = strength
        d.color = color
        try:
            d.angle = math.radians(8)
        except AttributeError:
            pass
        o = bpy.data.objects.new(name, d)
        bpy.context.scene.collection.objects.link(o)
        o.rotation_euler = Vector(direction).normalized().to_track_quat('-Z', 'Y').to_euler()
    sun('Key', (0.55, 0.7, -0.75), 3.2, (1.0, 0.97, 0.9))       # from front-left-above
    sun('Fill', (-0.8, 0.3, -0.3), 0.7, (0.75, 0.85, 1.0))      # cool fill from the right
    sun('Rim', (0.0, -1.0, -0.35), 1.4, (1.0, 0.95, 0.85))      # rim from behind


def camera(target, ortho, res, elev=25.0, azim=0.0):
    s = bpy.context.scene
    cd = bpy.data.cameras.new('Cam')
    cd.type = 'ORTHO'
    cd.ortho_scale = ortho
    cam = bpy.data.objects.new('Cam', cd)
    s.collection.objects.link(cam)
    e, a = math.radians(elev), math.radians(azim)
    d = Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e)))
    cam.location = Vector(target) + d * 20
    cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
    cd.clip_end = 100
    s.camera = cam
    s.render.resolution_x, s.render.resolution_y = res
    return cam


# ---------------------------------------------------------------- materials
MATS = {}


def mat(hexcol, emission=False, strength=1.0, outline=False):
    key = (hexcol, emission, strength, outline)
    if key in MATS:
        return MATS[key]
    m = bpy.data.materials.new(('Outline' if outline else hexcol) + ('_E' if emission else ''))
    try:
        m.use_nodes = True
    except Exception:
        pass
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    em = nt.nodes.new('ShaderNodeEmission')
    em.inputs['Strength'].default_value = strength
    nt.links.new(em.outputs[0], out.inputs['Surface'])
    col = lin(hexcol)
    if emission or outline:
        em.inputs['Color'].default_value = (*col, 1)
        if outline:
            m.use_backface_culling = True
        MATS[key] = m
        return m
    # Cel shading: diffuse light → ramp → multiplied with the base colour.
    diff = nt.nodes.new('ShaderNodeBsdfDiffuse')
    s2r = nt.nodes.new('ShaderNodeShaderToRGB')
    nt.links.new(diff.outputs[0], s2r.inputs[0])
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    el = ramp.color_ramp.elements
    el[0].position, el[0].color = 0.0, (0.52, 0.5, 0.6, 1)
    el[1].position, el[1].color = 0.42, (1, 1, 1, 1)
    mid = el.new(0.2)
    mid.color = (0.8, 0.78, 0.84, 1)
    hi = el.new(0.85)
    hi.color = (1.12, 1.1, 1.05, 1)
    nt.links.new(s2r.outputs[0], ramp.inputs[0])
    mul = nt.nodes.new('ShaderNodeVectorMath')
    mul.operation = 'MULTIPLY'
    nt.links.new(ramp.outputs[0], mul.inputs[0])
    mul.inputs[1].default_value = col
    nt.links.new(mul.outputs[0], em.inputs['Color'])
    MATS[key] = m
    return m


# ---------------------------------------------------------------- geometry helpers
def M(loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1)):
    return Matrix.LocRotScale(Vector(loc), Euler(rot), Vector(scale))


def sphere(r=1.0, seg=28, rings=18, cut=None, **t):
    """cut=('above'|'below', z) keeps only the part above/below a local z plane (before transform)."""
    def b(bm):
        geo = bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=r)
        if cut:
            keep, z = cut
            bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(0, 0, z),
                                   plane_no=(0, 0, 1), clear_inner=(keep == 'above'), clear_outer=(keep == 'below'))
        bmesh.ops.transform(bm, matrix=M(**t), verts=bm.verts[:])
    return b


def cyl(r1, r2, depth, seg=28, **t):
    def b(bm):
        bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=seg, radius1=r1, radius2=r2, depth=depth)
        bmesh.ops.transform(bm, matrix=M(**t), verts=bm.verts[:])
    return b


def box(**t):
    def b(bm):
        bmesh.ops.create_cube(bm, size=1.0)
        bmesh.ops.transform(bm, matrix=M(**t), verts=bm.verts[:])
    return b


def torus(R, r, seg=36, ring=12, **t):
    def b(bm):
        rings = []
        for i in range(seg):
            a = 2 * math.pi * i / seg
            ring_v = []
            for j in range(ring):
                c = 2 * math.pi * j / ring
                x = (R + r * math.cos(c)) * math.cos(a)
                y = (R + r * math.cos(c)) * math.sin(a)
                ring_v.append(bm.verts.new((x, y, r * math.sin(c))))
            rings.append(ring_v)
        for i in range(seg):
            for j in range(ring):
                a, b2 = rings[i], rings[(i + 1) % seg]
                bm.faces.new((a[j], b2[j], b2[(j + 1) % ring], a[(j + 1) % ring]))
        bmesh.ops.transform(bm, matrix=M(**t), verts=bm.verts[:])
    return b


def lathe(profile, seg=28, **t):
    """profile: [(radius, z), ...] bottom → top, closed with caps."""
    def b(bm):
        rings = []
        for r, z in profile:
            rings.append([bm.verts.new((r * math.cos(2 * math.pi * i / seg), r * math.sin(2 * math.pi * i / seg), z))
                          for i in range(seg)])
        for k in range(len(rings) - 1):
            for i in range(seg):
                a, c = rings[k], rings[k + 1]
                bm.faces.new((a[i], a[(i + 1) % seg], c[(i + 1) % seg], c[i]))
        bm.faces.new(list(reversed(rings[0])))
        bm.faces.new(rings[-1])
        bmesh.ops.transform(bm, matrix=M(**t), verts=bm.verts[:])
    return b


def poly(verts, faces, **t):
    def b(bm):
        vs = [bm.verts.new(v) for v in verts]
        for f in faces:
            bm.faces.new([vs[i] for i in f])
        bmesh.ops.transform(bm, matrix=M(**t), verts=bm.verts[:])
    return b


OUTLINE_W = [0.012]


def part(name, build, color, parent=None, smooth=True, bevel=0.0, outline=True, emission=False):
    bm = bmesh.new()
    build(bm)
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    for f in bm.faces:
        f.smooth = smooth and len(f.verts) <= 4
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    me.materials.append(mat(color, emission=emission))
    if bevel:
        bv = ob.modifiers.new('Bevel', 'BEVEL')
        bv.width = bevel
        bv.segments = 3
        bv.limit_method = 'ANGLE'
        for f in me.polygons:
            f.use_smooth = True
        try:
            bv.harden_normals = True
        except AttributeError:
            pass
    if outline and OUTLINE_W[0] > 0:
        me.materials.append(mat(P['ink'], outline=True))
        so = ob.modifiers.new('Outline', 'SOLIDIFY')
        so.thickness = OUTLINE_W[0]
        so.offset = 1.0
        so.use_flip_normals = True
        so.use_rim = False
        so.material_offset = 1
    if parent:
        ob.parent = parent
    return ob


def empty(name, loc=(0, 0, 0), parent=None):
    e = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(e)
    e.location = loc
    if parent:
        e.parent = parent
    return e


# ---------------------------------------------------------------- vikings (ui-settings.md §3)
def build_viking(who, color=None):
    """who: ragnar, bjorn, freja, harald (the jarl, any team colour), ylva (the wild viking) or sigrid (the scout)."""
    team = P[color] if color else P['sail_cream'] if who == 'ylva' else P['cloak'] if who == 'sigrid' else P[TEAM[who]]
    sleeve = shade(team, -0.18)
    rig = {}
    root = rig['root'] = empty('root')
    hips = rig['hips'] = empty('hips', (0, 0, 0.30), root)

    # torso
    part('tunic', sphere(1, scale=(0.30, 0.26, 0.27), loc=(0, 0, 0.16)), team, hips)
    part('skirt', cyl(0.30, 0.25, 0.14, loc=(0, 0, 0.03)), P['wood'] if who == 'ylva' else shade(team, -0.1), hips)
    if who == 'ylva':  # rainbow stripes: she can become any colour
        for z, c in ((0.07, 'red'), (0.17, 'blue'), (0.26, 'yellow')):
            r = 0.3 * math.sqrt(max(0.0, 1 - ((z - 0.16) / 0.27) ** 2)) + 0.004
            part('stripe', torus(r, 0.03, scale=(1, 0.88, 1), loc=(0, 0, z)), P[c], hips, outline=False)
    if who in ('harald', 'sigrid'):  # the jarl's cape / the scout's travelling cloak, behind the torso
        part('cape', box(scale=(0.52, 0.05, 0.5), rot=(-0.12, 0, 0), loc=(0, 0.25, 0.08)), shade(team, -0.3), hips, smooth=False, bevel=0.03)
        part('clasp', sphere(0.045, loc=(0, -0.2, 0.33)), P['gold'], hips)
    part('belt', torus(0.285, 0.035, scale=(1, 0.88, 1), loc=(0, 0, 0.09)), P['wood_dark'], hips)
    part('buckle', box(scale=(0.08, 0.03, 0.07), loc=(0, -0.255, 0.09)), P['gold'], hips, smooth=False, bevel=0.01)

    # legs
    for side, x in (('L', -0.11), ('R', 0.11)):
        leg = rig['leg' + side] = empty('leg' + side, (x, 0, 0.02), hips)
        part('thigh' + side, cyl(0.075, 0.07, 0.2, loc=(0, 0, -0.12)), P['pants'], leg)
        part('boot' + side, sphere(1, scale=(0.095, 0.13, 0.075), loc=(0, -0.03, -0.25)), P['boot'], leg)

    # arms
    for side, x in (('L', -0.30), ('R', 0.30)):
        arm = rig['arm' + side] = empty('arm' + side, (x, 0, 0.24), hips)
        part('sleeve' + side, sphere(1, scale=(0.085, 0.085, 0.15), loc=(0, 0, -0.1)), sleeve, arm)
        part('hand' + side, sphere(0.075, loc=(0, 0, -0.24)), P['skin'], arm)

    # head
    head = rig['head'] = empty('head', (0, 0, 0.42), hips)
    part('skull', sphere(0.27, loc=(0, 0, 0.17)), P['skin'], head)
    part('nose', sphere(0.065, loc=(0, -0.27, 0.165)), P['skin_dark'], head)
    for x in (-0.09, 0.09):
        part('eye', sphere(0.045, seg=16, rings=10, scale=(1, 1, 1.15), loc=(x, -0.235, 0.215)), P['black'], head, outline=False)
        part('glint', sphere(0.015, seg=10, rings=6, loc=(x + 0.015, -0.275, 0.235)), P['white'], head, outline=False, emission=True)

    if who in ('freja', 'ylva', 'sigrid'):
        hair = {'freja': P['hair_blonde'], 'ylva': P['hair_dark'], 'sigrid': P['hair_red']}[who]
        part('hair', sphere(0.285, loc=(0, 0.035, 0.19)), hair, head)
        for sx in (-1, 1):
            for k, (z, r) in enumerate(((0.06, 0.075), (-0.05, 0.068), (-0.15, 0.06))):
                part('braid', sphere(r, loc=(sx * 0.245, -0.02, z)), shade(hair, -0.08 * k), head)
            part('tie', sphere(0.035, loc=(sx * 0.245, -0.02, -0.21)), {'freja': P['red'], 'ylva': P['blue'], 'sigrid': P['gold']}[who], head, outline=False)
            part('cheek', sphere(0.042, seg=12, rings=8, scale=(1, 0.4, 0.7), loc=(sx * 0.15, -0.235, 0.115)), P['cheek'], head, outline=False)
        part('smile', sphere(1, seg=16, rings=10, cut=('below', 0), scale=(0.075, 0.03, 0.06), loc=(0, -0.252, 0.085)), P['mouth'], head, outline=False)
        browc = shade(hair, -0.25)
    else:
        beard = {'ragnar': P['beard_red'], 'bjorn': P['beard_grey'], 'harald': P['beard_brown']}[who]
        long = who in ('bjorn', 'harald')
        part('beard', sphere(1, scale=(0.25, 0.17, 0.25 if long else 0.2), loc=(0, -0.12, -0.06 if long else -0.04)), beard, head)
        for sx in (-1, 1):
            part('mustache', sphere(1, scale=(0.11, 0.07, 0.055), rot=(0, sx * 0.35, 0), loc=(sx * 0.075, -0.25, 0.105)), shade(beard, 0.08), head)
        if who in ('ragnar', 'harald'):  # loud, open grin
            part('mouth', sphere(1, seg=16, rings=10, scale=(0.075, 0.03, 0.05), loc=(0, -0.262, 0.035)), P['mouth'], head, outline=False)
        browc = shade(beard, -0.15)
    stern = who == 'bjorn'
    for sx in (-1, 1):
        part('brow', box(scale=(0.1, 0.03, 0.03), rot=(0, sx * (0.25 if stern else -0.18), 0), loc=(sx * 0.09, -0.25, 0.285)),
             browc, head, smooth=False, bevel=0.01, outline=False)

    # helmet + horns
    hz = 0.3  # helmet rim height: just above the brows
    if who == 'sigrid':
        # The scout wears a fur-trimmed hood instead of a helmet, and carries a spyglass instead of an axe.
        part('hood', sphere(0.31, scale=(1, 1, 0.95), loc=(0, 0.1, 0.22)), team, head)
        part('fur', torus(0.27, 0.05, rot=(1.35, 0, 0), loc=(0, -0.17, 0.2)), P['sail_cream'], head)
        part('hoodtip', sphere(0.1, loc=(0, 0.3, 0.42)), shade(team, -0.1), head)
        arm = rig['armR']
        # Brass spyglass: three telescoping tubes from the hand outwards, lens at the far end.
        for k, (r, z0, z1) in enumerate(((0.034, -0.2, -0.32), (0.044, -0.32, -0.44), (0.055, -0.44, -0.58))):
            part('tube', cyl(r, r, z0 - z1, seg=18, loc=(0, -0.06, (z0 + z1) / 2)), P['gold'] if k != 1 else shade(P['gold'], -0.2), arm)
            part('ring', torus(r + 0.004, 0.01, seg=18, ring=6, loc=(0, -0.06, z1)), P['wood_dark'], arm, outline=False)
        part('lens', cyl(0.05, 0.05, 0.01, seg=18, loc=(0, -0.06, -0.586)), P['ice'], arm, outline=False, emission=True)
        return rig
    part('helmet', sphere(0.29, cut=('above', 0.0), scale=(1, 1, 0.8), loc=(0, 0, hz)), P['steel'], head)
    part('rim', torus(0.29, 0.03, loc=(0, 0, hz)), P['steel_dark'], head)
    if who == 'harald':  # a gold crown around the helmet marks the jarl
        part('crown', cyl(0.305, 0.315, 0.07, loc=(0, 0, hz + 0.03)), P['gold'], head)
        for k in range(6):
            a = 2 * math.pi * k / 6 + math.pi / 6
            part('point', cyl(0.035, 0.0, 0.09, seg=8, loc=(0.31 * math.cos(a), 0.31 * math.sin(a), hz + 0.1)), P['gold'], head, smooth=False)
    else:
        part('knob', sphere(0.045, loc=(0, 0, hz + 0.235)), P['steel_dark'], head)
    for sx in (-1, 1):
        part('horn', cyl(0.07, 0.035, 0.2, rot=(0, sx * 1.0, 0), loc=(sx * 0.32, 0, hz + 0.12)), P['horn'], head)
        part('horntip', cyl(0.038, 0.004, 0.16, rot=(0, sx * 0.25, 0), loc=(sx * 0.41, 0, hz + 0.26)), P['horn'], head)

    # props
    if who in ('ragnar', 'freja', 'harald', 'ylva'):
        k = {'ragnar': 1.0, 'freja': 0.72, 'harald': 1.15, 'ylva': 0.72}[who]
        arm = rig['armR']
        part('handle', cyl(0.022 * k, 0.022 * k, 0.55 * k, loc=(0, -0.06, -0.2 + 0.12 * k)), P['wood_dark'], arm)
        part('blade', sphere(1, seg=24, rings=12, cut=('above', 0.0), scale=(0.17 * k, 0.025, 0.15 * k), rot=(0, math.pi / 2, 0),
                             loc=(0.015, -0.06, -0.2 + 0.34 * k)), P['steel'], arm)
    if who == 'bjorn':
        arm = rig['armL']
        sh = empty('shield', (-0.02, -0.16, -0.16), arm)
        part('shield', cyl(0.21, 0.21, 0.045, rot=(math.pi / 2, 0, 0)), P['blue'], sh)
        part('stripe', box(scale=(0.06, 0.05, 0.4), loc=(0, -0.002, 0)), P['white'], sh, smooth=False, outline=False)
        part('shieldrim', torus(0.21, 0.025, rot=(math.pi / 2, 0, 0)), P['gold'], sh)
        part('boss', sphere(0.06, loc=(0, -0.03, 0)), P['gold'], sh)
    return rig


def pose_viking(rig, anim, t):
    """t in [0, 1). Sets every joint for one frame of an animation."""
    p = 2 * math.pi * t
    hips, head = rig['hips'], rig['head']
    hips.location.z = 0.30
    for k in ('hips', 'head', 'legL', 'legR', 'armL', 'armR'):
        rig[k].rotation_euler = (0, 0, 0)
    rig['armL'].rotation_euler.y = 0.12   # slightly away from the body
    rig['armR'].rotation_euler.y = -0.12
    if anim == 'idle':
        hips.location.z = 0.30 + 0.012 * math.sin(p)
        head.rotation_euler.x = 0.05 * math.sin(p)
        head.rotation_euler.y = 0.04 * math.sin(p + 1)
        rig['armL'].rotation_euler.x = 0.08 * math.sin(p)
        rig['armR'].rotation_euler.x = -0.08 * math.sin(p)
    elif anim in ('run', 'carry'):
        hips.location.z = 0.30 + 0.04 * abs(math.sin(p))
        hips.rotation_euler.x = 0.16
        rig['legL'].rotation_euler.x = 0.75 * math.sin(p)
        rig['legR'].rotation_euler.x = -0.75 * math.sin(p)
        head.rotation_euler.x = -0.1
        if anim == 'run':
            rig['armL'].rotation_euler.x = -0.7 * math.sin(p)
            rig['armR'].rotation_euler.x = 0.7 * math.sin(p)
        else:  # arms raised out to the sides (straight up would hide them behind the big head)
            lift = 2.15 + 0.08 * math.sin(p)
            rig['armL'].rotation_euler = (0.15, lift, 0)
            rig['armR'].rotation_euler = (0.15, -lift, 0)
            hips.rotation_euler.x = 0.06
            head.rotation_euler.x = -0.05
    elif anim == 'attack':
        # Raise the axe out to the side and up, chop down in front, recover.
        # (Swinging around x would point straight at the camera and barely read.)
        def lerp(a, b, u):
            return a + (b - a) * u
        if t < 0.4:
            u = math.sin((t / 0.4) * math.pi / 2)
            ry, rx = lerp(-0.12, -2.3, u), lerp(0, 0.2, u)
        elif t < 0.6:
            u = (t - 0.4) / 0.2
            ry, rx = lerp(-2.3, -0.35, u), lerp(0.2, -1.1, u)
        else:
            u = (t - 0.6) / 0.4
            ry, rx = lerp(-0.35, -0.12, u), lerp(-1.1, 0, u)
        rig['armR'].rotation_euler = (rx, ry, 0)
        hips.rotation_euler.z = 0.25 * math.sin(p)
        hips.rotation_euler.x = 0.14 if 0.4 <= t < 0.7 else 0.0
        head.rotation_euler.x = 0.1 if 0.4 <= t < 0.7 else 0.0
        rig['armL'].rotation_euler.y = 0.12 + 0.5 * math.sin(math.pi * t)
    elif anim == 'victory':
        # Jump and cheer with both arms up to the sides.
        hop = abs(math.sin(p))
        hips.location.z = 0.30 + 0.1 * hop
        lift = 2.8 + 0.15 * math.sin(2 * p)
        rig['armL'].rotation_euler = (-0.35, lift, 0)
        rig['armR'].rotation_euler = (-0.35, -lift, 0)
        rig['legL'].rotation_euler.x = 0.3 * hop
        rig['legR'].rotation_euler.x = -0.3 * hop
        head.rotation_euler.x = -0.15
        head.rotation_euler.y = 0.12 * math.sin(p)
    elif anim == 'look':
        # The scout raises her spyglass and scans the island: arm up in front, head tipped back, a slow sweep.
        breath = math.sin(p)
        rig['armR'].rotation_euler = (-2.45 + 0.06 * breath, -0.35, 0)
        rig['armL'].rotation_euler = (-0.6, 0.5, 0)
        hips.rotation_euler.x = -0.08
        hips.location.z = 0.30 + 0.01 * breath
        head.rotation_euler.x = -0.22 + 0.04 * breath
    elif anim == 'fail':
        # Slump: head drops, arms hang, a slow sad shake. Played once; the last frame holds.
        u = min(1.0, t / 0.5)
        hips.location.z = 0.30 - 0.07 * u
        hips.rotation_euler.x = 0.1 * u
        head.rotation_euler.x = 0.32 * u
        head.rotation_euler.z = 0.22 * math.sin(2 * p) * u
        rig['armL'].rotation_euler = (0.35 * u, -0.15 * u, 0)
        rig['armR'].rotation_euler = (0.35 * u, 0.15 * u, 0)
        rig['legL'].rotation_euler.y = -0.12 * u
        rig['legR'].rotation_euler.y = 0.12 * u


# ---------------------------------------------------------------- loot (ui-settings.md §5)
def build_barrel(color):
    team = P[color]
    root = empty('root')
    prof = [(0.21 + 0.05 * math.sin(math.pi * k / 10), 0.62 * k / 10) for k in range(11)]
    part('body', lathe(prof), team, root)
    for z in (0.1, 0.5):
        rr = 0.21 + 0.05 * math.sin(math.pi * z / 0.62) + 0.012
        part('hoop', lathe([(rr, z - 0.03), (rr, z + 0.03)]), P['steel_dark'], root, smooth=True)
    part('lid', cyl(0.205, 0.205, 0.025, loc=(0, 0, 0.625)), P['wood_light'], root, smooth=False)
    part('plank', box(scale=(0.025, 0.36, 0.006), loc=(0, 0, 0.64)), P['wood'], root, smooth=False, outline=False)
    return root


def build_chest(color):
    team = P[color]
    root = empty('root')
    part('base', box(scale=(0.58, 0.4, 0.3), loc=(0, 0, 0.15)), P['wood'], root, smooth=False, bevel=0.03)
    for x in (-0.15, 0.15):
        part('panel', box(scale=(0.2, 0.02, 0.2), loc=(x, -0.2, 0.15)), team, root, smooth=False, bevel=0.01, outline=False)
    part('lid', cyl(0.2, 0.2, 0.58, rot=(0, math.pi / 2, 0), scale=(1, 1, 1), loc=(0, 0, 0.3)), team, root)
    part('trim', box(scale=(0.6, 0.42, 0.04), loc=(0, 0, 0.3)), P['gold'], root, smooth=False, bevel=0.012)
    for x in (-0.22, 0.22):
        part('band', torus(0.205, 0.022, rot=(0, math.pi / 2, 0), loc=(x, 0, 0.3)), P['gold'], root)
        part('bandside', box(scale=(0.045, 0.42, 0.3), loc=(x, 0, 0.15)), P['gold'], root, smooth=False, bevel=0.01)
    part('lock', box(scale=(0.1, 0.04, 0.11), loc=(0, -0.21, 0.27)), P['gold'], root, smooth=False, bevel=0.015)
    part('keyhole', box(scale=(0.02, 0.01, 0.04), loc=(0, -0.235, 0.26)), P['ink'], root, smooth=False, outline=False)
    return root


def build_house(color, opened=False):
    """opened: after the first hit - door smashed, a roof slab knocked loose, planks on the ground."""
    team = P[color]
    root = empty('root')
    part('walls', box(scale=(0.56, 0.46, 0.36), loc=(0, 0, 0.18)), P['wood_light'], root, smooth=False, bevel=0.02)
    for z in (0.09, 0.18, 0.27):
        part('log', box(scale=(0.57, 0.47, 0.012), loc=(0, 0, z)), P['wood'], root, smooth=False, outline=False)
    if opened:
        part('doorway', box(scale=(0.13, 0.02, 0.21), loc=(0, -0.236, 0.105)), P['black'], root, smooth=False, outline=False)
        part('door', box(scale=(0.13, 0.21, 0.02), rot=(0, 0, 0.5), loc=(0.12, -0.42, 0.012)), P['wood_dark'], root, smooth=False, bevel=0.01)
        for x, y, a in ((-0.22, -0.4, 0.9), (-0.1, -0.5, -0.4)):
            part('plank', box(scale=(0.16, 0.035, 0.02), rot=(0, 0, a), loc=(x, y, 0.01)), P['wood'], root, smooth=False)
    else:
        part('door', box(scale=(0.13, 0.02, 0.21), loc=(0, -0.235, 0.105)), P['wood_dark'], root, smooth=False, bevel=0.01)
    for x in (-0.17, 0.17):
        part('window', box(scale=(0.09, 0.02, 0.09), loc=(x, -0.236, 0.2)), P['window'], root, smooth=False, outline=False, emission=True, )
        part('frame', box(scale=(0.11, 0.015, 0.11), loc=(x, -0.232, 0.2)), P['wood_dark'], root, smooth=False, outline=False)
    # Gable walls in wood, roof as two coloured slabs with an overhang, so the slopes read as a roof.
    z0, z1, hy = 0.34, 0.64, 0.3
    for x in (-0.275, 0.275):
        part('gable', poly([(x, -hy, z0), (x, hy, z0), (x, 0, z1)], [(0, 1, 2)]), P['wood_light'], root, smooth=False)
    ang = math.atan2(z1 - z0, hy)
    slab = math.hypot(z1 - z0, hy) + 0.07
    for sy in (-1, 1):
        cy, cz = sy * hy / 2, (z0 + z1) / 2
        nrm = Vector((0, sy * math.sin(ang), math.cos(ang)))  # outward normal of this slope
        loc = Vector((0, cy, cz)) + nrm * 0.025 + Vector((0, sy * 0.025, -0.02))
        loose = opened and sy < 0  # the front slab is torn off
        if loose:
            part('loft', box(scale=(0.54, slab - 0.06, 0.02), rot=(-sy * ang, 0, 0), loc=tuple(loc - nrm * 0.03)), P['black'], root,
                 smooth=False, outline=False)
            for x, y, a in ((0.24, -0.46, 0.5), (0.33, -0.36, -0.3), (-0.32, -0.3, 1.2)):
                part('tile', box(scale=(0.12, 0.07, 0.02), rot=(0, 0, a), loc=(x, y, 0.012)), team, root, smooth=False, bevel=0.005)
        else:
            part('roof', box(scale=(0.68, slab, 0.05), rot=(-sy * ang, 0, 0), loc=tuple(loc)), team, root, smooth=False, bevel=0.015)
        for k in (0.3, 0.6):  # shingle rows
            l2 = Vector((0, sy * hy * (1 - k), z0 + (z1 - z0) * k)) + nrm * 0.052
            if loose:
                continue
            part('shingle', box(scale=(0.69, 0.02, 0.012), rot=(-sy * ang, 0, 0), loc=tuple(l2)), shade(team, -0.25), root, smooth=False, outline=False)
    for sx in (-1, 1):
        part('beam', box(scale=(0.035, 0.035, 0.22), rot=(0, sx * 0.55, 0), loc=(sx * 0.05, 0.0, 0.7)), P['wood_dark'], root, smooth=False, bevel=0.008)
    return root


def build_stone(_color=None):
    """A chunky boulder with a smaller rock leaning on it."""
    root = empty('root')
    part('boulder', sphere(0.3, seg=10, rings=7, cut=('above', -0.02), scale=(1.15, 0.95, 0.95), loc=(0, 0, 0.02)), P['stone'], root, smooth=False)
    part('rock', sphere(0.15, seg=8, rings=6, cut=('above', -0.01), scale=(1.1, 1, 0.85), loc=(0.27, -0.12, 0)), shade(P['stone'], 0.18), root, smooth=False)
    part('moss', sphere(0.1, seg=10, rings=6, cut=('above', 0), scale=(1.4, 1, 0.35), loc=(-0.08, -0.02, 0.27)), '#6CBB48', root, outline=False)
    return root


def build_hidden(_color=None):
    """Loot under a tarp tied with rope; the colour underneath is a secret."""
    root = empty('root')
    part('tarp', sphere(0.33, seg=20, rings=12, cut=('above', 0.0), scale=(1.1, 0.95, 1.05)), P['tarp'], root)
    part('hem', torus(0.34, 0.035, scale=(1.08, 0.93, 1), loc=(0, 0, 0.03)), shade(P['tarp'], -0.15), root)
    for a in (0.0, math.pi / 2):
        part('rope', sphere(0.337, seg=24, rings=12, cut=('above', 0.0), scale=(1.1, 0.07, 1.06), rot=(0, 0, a)), P['rope'], root, outline=False)
    part('knot', sphere(0.05, loc=(0, 0, 0.35)), P['rope'], root)
    return root


def build_key(color):
    """A big key in its team colour standing upright and facing the camera, shaped like a key icon
    (ring, shaft, teeth) so it never reads as a barrel at phone size. The colour decides who may take it."""
    team = P[color]
    dark = shade(team, -0.3)
    root = empty('root')
    key = empty('key', (0.1, 0, 0.02), root)
    key.rotation_euler = (0, math.radians(-20), math.radians(22))
    key.scale = (0.78, 0.78, 0.78)  # undo the loot turn so it faces the camera
    part('bow', torus(0.17, 0.065, seg=32, ring=12, rot=(math.pi / 2, 0, 0), loc=(0, 0, 0.74)), team, key)
    part('bowrim', torus(0.17, 0.03, seg=32, ring=8, rot=(math.pi / 2, 0, 0), loc=(0, -0.045, 0.74)), P['gold'], key, outline=False)
    part('collar', torus(0.07, 0.028, seg=20, ring=8, loc=(0, 0, 0.53)), P['gold'], key)
    part('shaft', cyl(0.05, 0.05, 0.5, seg=16, loc=(0, 0, 0.31)), team, key)
    part('tip', sphere(0.05, seg=12, rings=8, loc=(0, 0, 0.06)), team, key, outline=False)
    for z, w in ((0.1, 0.17), (0.22, 0.12)):
        part('tooth', box(scale=(w, 0.08, 0.075), loc=(w / 2 + 0.02, 0, z)), team, key, smooth=False, bevel=0.015)
        part('notch', box(scale=(w * 0.6, 0.02, 0.02), loc=(w / 2 + 0.03, -0.045, z)), dark, key, smooth=False, outline=False)
    return root


def build_padlock(color):
    """A big padlock in the colour of the key that opens it, placed where the chest's lock is so the
    two frames line up in the game. A gold plate with a keyhole makes it read as a lock at small size."""
    team = P[color]
    root = empty('root')
    lock = empty('lock', (0, -0.3, 0.2), root)
    lock.scale = (1.5, 1.5, 1.5)
    part('shackle', torus(0.09, 0.032, seg=24, ring=10, rot=(math.pi / 2, 0, 0), loc=(0, 0, 0.13)), P['steel'], lock)
    part('body', box(scale=(0.28, 0.1, 0.22), loc=(0, 0, 0.02)), team, lock, smooth=False, bevel=0.03)
    part('plate', box(scale=(0.15, 0.02, 0.14), loc=(0, -0.055, 0.02)), P['gold'], lock, smooth=False, outline=False)
    part('hole', sphere(0.03, seg=12, rings=8, loc=(0, -0.068, 0.045)), P['ink'], lock, outline=False)
    part('slot', box(scale=(0.018, 0.01, 0.055), loc=(0, -0.068, 0.0)), P['ink'], lock, smooth=False, outline=False)
    return root


def build_ice(_color=None):
    """A block of ice that encloses one loot object (drawn semi-transparent on top of it)."""
    root = empty('root')
    part('block', box(scale=(0.66, 0.54, 0.62), loc=(0, 0, 0.31)), P['ice'], root, smooth=False, bevel=0.07)
    part('top', box(scale=(0.5, 0.4, 0.02), loc=(0, 0, 0.625)), P['white'], root, smooth=False, outline=False)
    for x, z, a in ((-0.18, 0.4, 0.5), (-0.08, 0.46, 0.5), (0.2, 0.22, -0.4)):  # glints on the front face
        part('glint', box(scale=(0.03, 0.01, 0.2), rot=(0, a, 0), loc=(x, -0.275, z)), P['white'], root, smooth=False, outline=False, emission=True)
    for x in (-0.2, 0.05, 0.24):  # icicles hanging from the top edge
        part('icicle', cyl(0.04, 0.0, 0.13, seg=8, rot=(math.pi, 0, 0), loc=(x, -0.27, 0.56)), P['ice_dark'], root, smooth=False, outline=False)
    return root


def build_keg(color):
    """A squat black powder keg with a band in the team colour, a skull-free warning stripe and a lit fuse."""
    team = P[color]
    root = empty('root')
    prof = [(0.19 + 0.045 * math.sin(math.pi * k / 10), 0.5 * k / 10) for k in range(11)]
    part('body', lathe(prof), P['soot'], root)
    part('band', lathe([(0.238, 0.2), (0.238, 0.31)]), team, root)
    for z in (0.06, 0.44):
        rr = 0.19 + 0.045 * math.sin(math.pi * z / 0.5) + 0.01
        part('hoop', lathe([(rr, z - 0.02), (rr, z + 0.02)]), P['steel_dark'], root)
    part('lid', cyl(0.19, 0.19, 0.02, loc=(0, 0, 0.505)), P['ash'], root, smooth=False)
    part('fuse', cyl(0.014, 0.014, 0.16, seg=8, rot=(0.35, 0.25, 0), loc=(0.03, -0.02, 0.58)), P['rope'], root)
    part('spark', sphere(0.045, seg=10, rings=6, loc=(0.06, -0.05, 0.66)), P['lava_hot'], root, outline=False, emission=True)
    part('spark2', sphere(0.028, seg=8, rings=6, loc=(0.09, -0.07, 0.69)), P['lava'], root, outline=False, emission=True)
    return root


def build_cage(color):
    """A round cage with bars in the team colour. The prisoner is drawn by the game behind the bars."""
    team = P[color]
    root = empty('root')
    part('base', cyl(0.3, 0.32, 0.07, seg=28, loc=(0, 0, 0.035)), P['wood'], root, bevel=0.01)
    part('ring', torus(0.28, 0.022, seg=32, ring=8, loc=(0, 0, 0.62)), team, root)
    part('ringlow', torus(0.28, 0.018, seg=32, ring=8, loc=(0, 0, 0.09)), team, root)
    for k in range(10):  # only the bars in front and at the sides (the back ones would hide the prisoner)
        a = math.pi * (1.05 + 0.9 * k / 9)
        part('bar', cyl(0.016, 0.016, 0.56, seg=8, loc=(0.28 * math.cos(a), 0.28 * math.sin(a), 0.36)), team, root)
    for k in range(4):
        a = math.pi * k / 4
        part('dome', torus(0.28, 0.014, seg=24, ring=6, rot=(math.pi / 2, 0, a), loc=(0, 0, 0.62), scale=(1, 1, 0.55)), team, root, outline=False)
    part('hook', torus(0.05, 0.014, seg=16, ring=6, rot=(math.pi / 2, 0, 0), loc=(0, 0, 0.8)), P['steel_dark'], root)
    part('lock', box(scale=(0.09, 0.03, 0.08), loc=(0, -0.29, 0.3)), P['gold'], root, smooth=False)
    return root


def build_raven(t):
    """A cartoon raven seen from the side, wings at phase t (0..1 of one flap)."""
    root = empty('root')
    blk = P['raven']
    part('body', sphere(1, scale=(0.3, 0.16, 0.17), loc=(0, 0, 0)), blk, root)
    part('head', sphere(0.13, loc=(0.3, 0, 0.1)), blk, root)
    part('beak', cyl(0.05, 0.0, 0.16, seg=10, rot=(0, math.pi / 2, 0), loc=(0.47, 0, 0.08)), '#5A5F6A', root)
    part('eye', sphere(0.03, seg=10, rings=6, loc=(0.36, -0.11, 0.15)), P['white'], root, outline=False)
    part('pupil', sphere(0.016, seg=8, rings=6, loc=(0.375, -0.13, 0.155)), P['black'], root, outline=False)
    part('tail', box(scale=(0.24, 0.12, 0.03), rot=(0, 0.25, 0), loc=(-0.36, 0, -0.02)), blk, root, smooth=False)
    flap = math.sin(2 * math.pi * t)
    for side in (-1, 1):
        wing = empty('wing', (0, side * 0.1, 0.1), root)
        wing.rotation_euler = (side * (0.2 + 0.8 * flap), 0, side * -0.45)  # swept back
        part('feathers', sphere(1, seg=20, rings=10, scale=(0.17, 0.4, 0.03), loc=(0, side * 0.34, 0)), '#343A48', wing)
        for k in range(3):  # three long primary feathers
            part('primary', sphere(1, seg=12, rings=6, scale=(0.05, 0.16, 0.02), loc=(-0.06 - 0.05 * k, side * (0.72 - 0.03 * k), 0)),
                 '#2B2F38', wing)
    for side in (-1, 1):
        part('leg', cyl(0.012, 0.012, 0.12, seg=6, loc=(0.02, side * 0.05, -0.2)), '#5A5F6A', root, outline=False)
    return root


RAVEN_W, RAVEN_H, RAVEN_FRAMES = 200, 160, 6


def render_raven(manifest):
    frames = []
    for f in range(RAVEN_FRAMES):
        reset_scene()
        OUTLINE_W[0] = 0.014
        build_raven(f / RAVEN_FRAMES)
        cam = camera((0, 0, 0.05), 1.9, (RAVEN_W, RAVEN_H), elev=30)
        path = os.path.join(TMP, 'raven', f'fly_{f:02d}.png')
        render_to(path)
        frames.append(path)
    rel = 'assets/fx/raven.webp'
    pack(frames, RAVEN_W, RAVEN_H, 3, os.path.join(PUBLIC, rel))
    manifest['raven'] = {'sheet': rel, 'frameWidth': RAVEN_W, 'frameHeight': RAVEN_H, 'originX': 0.5, 'originY': 0.5,
                         'anims': {'fly': {'start': 0, 'end': RAVEN_FRAMES - 1, 'fps': 12}}}


# ---------------------------------------------------------------- longship (ui-settings.md §4)
# Longship looks: the default one plus three unlocked by stars in Skeppsvarvet (0.4).
SHIP_STYLES = {
    'ormen': {'sail': ('#D8342B', '#F4EAD8'), 'dragon': '#D9A441', 'shields': ('#D8342B', '#F4EAD8'), 'horn': '#F4E6C8'},
    'havsorn': {'sail': ('#2F6FA8', '#F4EAD8'), 'dragon': '#E8EEF2', 'shields': ('#2F6FA8', '#F4EAD8'), 'horn': '#F5C542'},
    'nordstjarnan': {'sail': ('#22365F', '#22365F'), 'dragon': '#A9B3BD', 'shields': ('#22365F', '#F5C542'), 'horn': '#F4E6C8',
                     'star': True},
    'ymer': {'sail': ('#2A1D17', '#F5C542'), 'dragon': '#B8322A', 'shields': ('#2A1D17', '#F5C542'), 'horn': '#F5C542'},
    'surt': {'sail': ('#F2642A', '#FFC23D'), 'dragon': '#2A2224', 'shields': ('#F2642A', '#2A2224'), 'horn': '#FFC23D'},
}


def build_ship(style='ormen'):
    st = SHIP_STYLES[style]
    root = empty('root')
    part('hull', sphere(1, seg=40, rings=20, cut=('below', 0.0), scale=(1.25, 0.36, 0.32), loc=(0, 0, 0.27)), P['wood'], root)
    part('strake', sphere(1, seg=40, rings=20, cut=('below', 0.0), scale=(1.27, 0.37, 0.1), loc=(0, 0, 0.2)), P['wood_dark'], root)
    part('deck', cyl(1, 1, 0.04, seg=40, scale=(1.22, 0.34, 1), loc=(0, 0, 0.27)), P['wood_light'], root, smooth=False)
    # dragon prow (+x) and curled stern (-x)
    for k in range(7):
        u = k / 6
        part('neck', sphere(0.12 - 0.04 * u, loc=(1.1 + 0.4 * u, 0, 0.25 + 0.55 * u * u ** 0.2)), st['dragon'], root)
    part('dragonhead', sphere(1, scale=(0.17, 0.1, 0.11), loc=(1.56, 0, 0.86)), st['dragon'], root)
    part('snout', sphere(1, scale=(0.1, 0.07, 0.06), loc=(1.7, 0, 0.83)), st['dragon'], root)
    for sy in (-1, 1):
        part('dragoneye', sphere(0.025, seg=10, rings=6, loc=(1.6, sy * 0.09, 0.9)), P['black'], root, outline=False)
        part('dragonhorn', cyl(0.03, 0.004, 0.14, rot=(sy * 0.4, -0.9, 0), loc=(1.48, sy * 0.05, 0.98)), st['horn'], root)
    for k in range(7):
        u = k / 6
        ang = u * math.pi * 1.1
        part('tail', sphere(0.11 - 0.05 * u, loc=(-1.1 - 0.25 * math.sin(ang), 0, 0.25 + 0.25 * (1 - math.cos(ang)) + 0.15 * u)), st['dragon'], root)
    # mast, yard, striped sail
    part('mast', cyl(0.035, 0.03, 1.35, loc=(0, 0.02, 0.9)), P['wood_dark'], root)
    part('yard', cyl(0.025, 0.025, 1.1, rot=(0, math.pi / 2, 0), loc=(0, -0.02, 1.48)), P['wood_dark'], root)
    n = 6
    for i in range(n):
        x = -0.5 + (i + 0.5) / n
        bulge = -0.07 * math.cos(x * math.pi)
        part('sail', box(scale=(1.0 / n + 0.002, 0.025, 0.82), loc=(x, -0.05 + bulge, 1.05)),
             st['sail'][i % 2], root, smooth=False, outline=False)
    part('sailedge', box(scale=(1.02, 0.03, 0.03), loc=(0, -0.06, 0.64)), P['wood_dark'], root, smooth=False, outline=False)
    if st.get('star'):  # a gold compass star on the sail
        for sx, sz, a in ((0.05, 0.5, 0), (0.5, 0.05, 0), (0.035, 0.3, 45), (0.035, 0.3, -45)):
            part('star', box(scale=(sx, 0.012, sz), rot=(0, math.radians(a), 0), loc=(0, -0.145, 1.05)), P['gold'], root, smooth=False, outline=False)
        part('starcore', sphere(0.05, seg=12, rings=8, loc=(0, -0.15, 1.05)), P['gold'], root, outline=False)
    # shields along the side facing the camera
    for i in range(7):
        x = -0.84 + i * 0.28
        part('shield', cyl(0.1, 0.1, 0.03, rot=(math.pi / 2, 0, 0), loc=(x, -0.335, 0.25)), st['shields'][i % 2], root)
        part('shieldrim', torus(0.1, 0.014, seg=24, ring=8, rot=(math.pi / 2, 0, 0), loc=(x, -0.35, 0.25)), P['gold'], root, outline=False)
        part('boss', sphere(0.028, seg=12, rings=8, loc=(x, -0.36, 0.25)), P['gold'], root, outline=False)
    return root


def build_boat(color):
    """A small colour ship (snäcka) with a sail in its team colour – extra seats for that colour."""
    team = P[color]
    root = empty('root')
    part('hull', sphere(1, seg=32, rings=16, cut=('below', 0.0), scale=(0.72, 0.3, 0.26), loc=(0, 0, 0.22)), P['wood'], root)
    part('strake', sphere(1, seg=32, rings=16, cut=('below', 0.0), scale=(0.74, 0.31, 0.08), loc=(0, 0, 0.17)), team, root)
    part('deck', cyl(1, 1, 0.03, seg=32, scale=(0.69, 0.28, 1), loc=(0, 0, 0.22)), P['wood_light'], root, smooth=False)
    for sx in (-1, 1):  # curled prow and stern
        for k in range(5):
            u = k / 4
            ang = u * math.pi * 0.9
            part('curl', sphere(0.075 - 0.025 * u, loc=(sx * (0.66 + 0.12 * math.sin(ang)), 0, 0.22 + 0.16 * (1 - math.cos(ang)) + 0.1 * u)), P['wood_dark'], root)
    part('mast', cyl(0.025, 0.022, 0.8, loc=(0, 0.02, 0.6)), P['wood_dark'], root)
    part('yard', cyl(0.018, 0.018, 0.62, rot=(0, math.pi / 2, 0), loc=(0, -0.02, 0.95)), P['wood_dark'], root)
    part('sail', box(scale=(0.58, 0.02, 0.46), loc=(0, -0.05, 0.71)), team, root, smooth=False)
    part('band', box(scale=(0.59, 0.025, 0.08), loc=(0, -0.055, 0.71)), P['sail_cream'], root, smooth=False, outline=False)
    for x in (-0.36, 0.0, 0.36):
        part('shield', cyl(0.075, 0.075, 0.025, rot=(math.pi / 2, 0, 0), loc=(x, -0.29, 0.2)), team, root)
        part('boss', sphere(0.022, seg=10, rings=6, loc=(x, -0.305, 0.2)), P['gold'], root, outline=False)
    return root


# ---------------------------------------------------------------- rendering + packing
def render_to(path):
    s = bpy.context.scene
    os.makedirs(os.path.dirname(path), exist_ok=True)
    s.render.filepath = path
    bpy.ops.render.render(write_still=True)


def anchor(cam, world_point):
    s = bpy.context.scene
    v = world_to_camera_view(s, cam, Vector(world_point))
    return round(v.x, 4), round(1 - v.y, 4)


SHEET_QUALITY = 86  # lossy WebP keeps the download small (alpha included)


def save_image(img, path, quality=None):
    if path.endswith('.webp'):
        img.file_format = 'WEBP'
        img.filepath_raw = path
        img.save(quality=quality or SHEET_QUALITY)
    else:
        img.file_format = 'PNG'
        img.filepath_raw = path
        img.save()


def fade_png(path, factor):
    """Multiply a rendered PNG's alpha in place (used for the see-through ice block)."""
    img = bpy.data.images.load(path)
    px = np.empty(len(img.pixels), dtype=np.float32)
    img.pixels.foreach_get(px)
    px = px.reshape(-1, 4)
    px[:, 3] *= factor
    w, h = img.size
    bpy.data.images.remove(img)
    out = bpy.data.images.new('faded', w, h, alpha=True)
    out.pixels.foreach_set(px.ravel())
    save_image(out, path)
    bpy.data.images.remove(out)


def pack(paths, fw, fh, cols, out_path, quality=None):
    n = len(paths)
    cols = min(cols, n)
    rows = math.ceil(n / cols)
    W, H = cols * fw, rows * fh
    sheet = np.zeros((H, W, 4), dtype=np.float32)
    buf = np.empty(fw * fh * 4, dtype=np.float32)
    for i, p in enumerate(paths):
        img = bpy.data.images.load(p)
        img.pixels.foreach_get(buf)
        px = buf.reshape(fh, fw, 4)
        r, c = divmod(i, cols)
        sheet[H - (r + 1) * fh:H - r * fh, c * fw:(c + 1) * fw] = px
        bpy.data.images.remove(img)
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    out = bpy.data.images.new('sheet', W, H, alpha=True)
    out.pixels.foreach_set(sheet.ravel())
    save_image(out, out_path, quality)
    bpy.data.images.remove(out)
    return cols, rows



VIKING_ANIMS = [('idle', 12, 8), ('run', 10, 16), ('attack', 10, 18), ('carry', 10, 14), ('victory', 10, 12), ('fail', 10, 9)]
# Every rendered character: (file name, builder name, team colour or None). Harald (the jarl) comes in all three colours.
CHARACTERS = {
    'ragnar': ('ragnar', 'red'), 'bjorn': ('bjorn', 'blue'), 'freja': ('freja', 'yellow'),
    'harald-red': ('harald', 'red'), 'harald-blue': ('harald', 'blue'), 'harald-yellow': ('harald', 'yellow'),
    'ylva': ('ylva', None), 'sigrid': ('sigrid', None),
}
EXTRA_ANIMS = {'sigrid': [('look', 10, 10)]}  # character-specific animations
VIKING_FRAME = 192  # shown at ~92 logical px = 184 px on the 2x canvas
VIKING_QUALITY = 78  # character sheets are the bulk of the download


def render_viking(key, manifest):
    who, color = CHARACTERS[key]
    reset_scene()
    OUTLINE_W[0] = 0.013
    rig = build_viking(who, color)
    rig['root'].rotation_euler.z = math.radians(20)
    cam = camera((0, 0, 0.62), 1.7, (VIKING_FRAME, VIKING_FRAME), elev=22)
    frames, anims, idx = [], {}, 0
    for name, count, fps in VIKING_ANIMS + EXTRA_ANIMS.get(who, []):
        for f in range(count):
            pose_viking(rig, name, f / count)
            path = os.path.join(TMP, key, f'{name}_{f:02d}.png')
            render_to(path)
            frames.append(path)
        anims[name] = {'start': idx, 'end': idx + count - 1, 'fps': fps}
        idx += count
    rel = f'assets/characters/{key}/{key}.webp'
    pack(frames, VIKING_FRAME, VIKING_FRAME, 8, os.path.join(PUBLIC, rel), quality=VIKING_QUALITY)
    ox, oy = anchor(cam, (0, 0, 0))
    # portrait: head and shoulders, nearly frontal
    pose_viking(rig, 'idle', 0)
    rig['root'].rotation_euler.z = math.radians(12)
    bpy.data.objects.remove(cam)
    camera((0, 0, 0.92), 1.2, (208, 208), elev=8)
    prel = f'assets/characters/{key}/portrait.webp'
    tmp = os.path.join(TMP, key, 'portrait.png')
    render_to(tmp)
    pack([tmp], 208, 208, 1, os.path.join(PUBLIC, prel))
    entry = {
        'name': key, 'sheet': rel, 'portrait': prel, 'frameWidth': VIKING_FRAME, 'frameHeight': VIKING_FRAME,
        'originX': ox, 'originY': oy, 'anims': anims,
    }
    if who == 'harald':
        manifest.setdefault('jarls', {})[color] = entry
    elif who == 'ylva':
        manifest['wild'] = entry
    elif who == 'sigrid':
        manifest['scout'] = entry
    else:
        manifest['vikings'][color] = entry


LOOT_FRAME = 160  # shown at ~81 logical px


def render_loot(manifest):
    frames, names = [], []
    builders = {
        'barrel': build_barrel, 'chest': build_chest, 'house': build_house,
        'house-open': lambda c: build_house(c, opened=True),
    }
    jobs = [(kind, build, color) for kind, build in builders.items() for color in ('red', 'blue', 'yellow')]
    jobs += [('stone', build_stone, None), ('hidden', build_hidden, None)]
    # 0.4 – Isriket: keys per colour, and overlays drawn on top of other loot (padlocks per key colour, ice).
    jobs += [('key', build_key, color) for color in ('red', 'blue', 'yellow')]
    jobs += [('padlock', build_padlock, color) for color in ('red', 'blue', 'yellow')]
    jobs += [('ice', build_ice, None)]
    # 0.5 – Muspelheim: powder kegs and cages per colour.
    jobs += [('keg', build_keg, color) for color in ('red', 'blue', 'yellow')]
    jobs += [('cage', build_cage, color) for color in ('red', 'blue', 'yellow')]
    for kind, build, color in jobs:
            reset_scene()
            OUTLINE_W[0] = 0.012
            root = build(color)
            root.rotation_euler.z = math.radians(-22)
            cam = camera((0, 0, 0.33), 1.0, (LOOT_FRAME, LOOT_FRAME), elev=28)
            name = f'{kind}-{color}' if color else kind
            path = os.path.join(TMP, 'loot', f'{name}.png')
            render_to(path)
            if kind == 'ice':
                fade_png(path, 0.68)  # see-through, so the frozen loot shows inside
            frames.append(path)
            names.append(name)
    ox, oy = anchor(cam, (0, 0, 0))
    rel = 'assets/loot/loot.webp'
    pack(frames, LOOT_FRAME, LOOT_FRAME, 3, os.path.join(PUBLIC, rel))
    manifest['loot'] = {'sheet': rel, 'frameWidth': LOOT_FRAME, 'frameHeight': LOOT_FRAME, 'originX': ox, 'originY': oy,
                        'frames': {n: i for i, n in enumerate(names)}}


SHIP_W, SHIP_H, SHIP_FRAMES = 424, 272, 12


def render_ship(manifest):
    """The longship in every style. 'ormen' is the default ship (manifest['ship']); the others are
    the ships unlocked in Skeppsvarvet (manifest['shipVariants'])."""
    manifest['shipVariants'] = {}
    for style in SHIP_STYLES:
        reset_scene()
        OUTLINE_W[0] = 0.02
        root = build_ship(style)
        cam = camera((0.1, 0, 0.7), 3.6, (SHIP_W, SHIP_H), elev=18)
        frames = []
        for f in range(SHIP_FRAMES):
            p = 2 * math.pi * f / SHIP_FRAMES
            root.location.z = 0.02 * math.sin(p)
            root.rotation_euler = (0.025 * math.sin(p + 0.6), 0.035 * math.sin(p), 0)
            path = os.path.join(TMP, 'ship', f'{style}_{f:02d}.png')
            render_to(path)
            frames.append(path)
        rel = 'assets/ships/longship.webp' if style == 'ormen' else f'assets/ships/longship-{style}.webp'
        pack(frames, SHIP_W, SHIP_H, 4, os.path.join(PUBLIC, rel))
        ox, oy = anchor(cam, (0, 0, 0.22))
        info = {'sheet': rel, 'frameWidth': SHIP_W, 'frameHeight': SHIP_H, 'originX': ox, 'originY': oy,
                'anims': {'bob': {'start': 0, 'end': SHIP_FRAMES - 1, 'fps': 8}}}
        manifest['shipVariants'][style] = info
        if style == 'ormen':
            manifest['ship'] = info
        print(f'[viking-loot] rendered ship {style}')


BOAT_W, BOAT_H = 200, 176


def render_boats(manifest):
    """One small colour ship per team colour, packed side by side."""
    frames = []
    for color in ('red', 'blue', 'yellow'):
        reset_scene()
        OUTLINE_W[0] = 0.016
        build_boat(color)
        cam = camera((0, 0, 0.5), 1.9, (BOAT_W, BOAT_H), elev=18)
        path = os.path.join(TMP, 'boats', f'boat-{color}.png')
        render_to(path)
        frames.append(path)
    rel = 'assets/ships/boats.webp'
    pack(frames, BOAT_W, BOAT_H, 3, os.path.join(PUBLIC, rel))
    ox, oy = anchor(cam, (0, 0, 0.2))
    manifest['boats'] = {'sheet': rel, 'frameWidth': BOAT_W, 'frameHeight': BOAT_H, 'originX': ox, 'originY': oy,
                         'frames': {'red': 0, 'blue': 1, 'yellow': 2}}


# ---------------------------------------------------------------- island (background)
# The island is laid out in the game's logical 360x640 coordinates: the image covers
# x 0..360, y ISLAND_TOP..ISLAND_TOP+ISLAND_H and is drawn at 2x for the zoomed camera.
ISLAND_TOP, ISLAND_H, ISLAND_ELEV, PX = 36, 372, 50.0, 0.01
ISLAND_CY = ISLAND_TOP + ISLAND_H / 2


def L(lx, ly, z=0.0):
    """Game (logical) coordinates on the ground → world, so the render lines up with the loot layout."""
    return Vector(((lx - 180) * PX, (ISLAND_CY - ly) * PX / math.sin(math.radians(ISLAND_ELEV)), z))


def rrect(x, y, w, h, r, seg=8):
    pts = []
    for cx, cy, a0 in ((x + w - r, y + r, -90), (x + w - r, y + h - r, 0), (x + r, y + h - r, 90), (x + r, y + r, 180)):
        for i in range(seg + 1):
            a = math.radians(a0 + 90 * i / seg)
            pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts


def slab(top, bottom, z_top, z_bottom):
    """A prism between two outlines (same point count) given in logical coordinates."""
    def b(bm):
        t = [bm.verts.new(L(x, y, z_top)) for x, y in top]
        u = [bm.verts.new(L(x, y, z_bottom)) for x, y in bottom]
        n = len(t)
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((u[i], u[j], t[j], t[i]))
        bm.faces.new(t)
        bm.faces.new(list(reversed(u)))
    return b


def ground_disc(lx, ly, w, h, z, thick=0.01, seg=20):
    """A flat ellipse lying on the ground, w x h in logical px as seen in the game."""
    def b(bm):
        bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=seg, radius1=0.5, radius2=0.42, depth=thick)
        sy = h * PX / math.sin(math.radians(ISLAND_ELEV))
        bmesh.ops.transform(bm, matrix=M(loc=L(lx, ly, z + thick / 2), scale=(w * PX, sy, 1)), verts=bm.verts[:])
    return b


def build_spire(lx, ly, s):
    """Muspelheim: a basalt spire with glowing cracks instead of a tree."""
    root = empty('spire', L(lx, ly))
    part('spire', cyl(0.13 * s, 0.03 * s, 0.62 * s, seg=7, loc=(0, 0, 0.31 * s)), P['basalt'], root, smooth=False)
    part('spire2', cyl(0.08 * s, 0.02 * s, 0.38 * s, seg=6, loc=(0.12 * s, 0.03 * s, 0.19 * s)), P['ash'], root, smooth=False)
    part('crack', box(scale=(0.02 * s, 0.01, 0.3 * s), rot=(0, 0.2, 0), loc=(0.01, -0.1 * s, 0.25 * s)), P['lava'], root,
         smooth=False, outline=False, emission=True)
    return root


def build_tree(lx, ly, s, snow=False):
    root = empty('tree', L(lx, ly))
    part('trunk', cyl(0.04 * s, 0.035 * s, 0.24 * s, seg=10, loc=(0, 0, 0.12 * s)), P['wood_dark'], root)
    greens = ('#2C6B4A', '#357A55', '#428A61') if snow else ('#2F7D3A', '#3C9445', '#4FAE52')
    for i, col in enumerate(greens):
        r = (0.21 - i * 0.05) * s
        z = (0.36 + i * 0.22) * s
        part('crown', cyl(r, 0.0, 0.42 * s, seg=14, loc=(0, 0, z)), col, root, smooth=False)
        if snow:  # a snow cap on every tier
            part('snowcap', cyl(r * 0.62, 0.0, 0.26 * s, seg=14, loc=(0, 0, z + 0.09 * s)), P['snow'], root, smooth=False, outline=False)
    return root


def build_rock(lx, ly, s, snow=False):
    root = empty('rock', L(lx, ly))
    part('rock', sphere(0.2 * s, seg=9, rings=6, cut=('above', -0.02), scale=(1.15, 0.9, 0.62)), '#8E9196', root, smooth=False)
    part('rock2', sphere(0.11 * s, seg=8, rings=5, cut=('above', -0.01), loc=(0.19 * s, -0.08 * s, 0), scale=(1, 0.9, 0.7)),
         '#A7A9AD', root, smooth=False)
    if snow:
        part('rocksnow', sphere(0.16 * s, seg=9, rings=6, cut=('above', 0.0), scale=(1.15, 0.9, 0.35), loc=(0, 0, 0.06 * s)), P['snow'], root, outline=False)
    return root


def build_island(snow=False, lava=False):
    """The island under the loot. snow=True: the winter version used in Isriket; lava=True: Muspelheim."""
    C = {
        'cliff': '#7A8591' if snow else '#7D8086', 'sand': '#D6E1E8' if snow else '#E6CF98',
        'grass': P['snow'] if snow else '#6CBB48', 'patch': P['snow_shade'] if snow else '#86CC5B',
        'cobble': '#B7C6D2' if snow else '#D3CBB8',
        'bush': ('#3F7F63', '#4C8E70') if snow else ('#4FAE52', '#5FBF5A'),
    }
    if lava:
        C = {'cliff': '#2E292A', 'sand': '#4A4244', 'grass': '#5E5553', 'patch': P['lava'], 'cobble': '#766B68',
             'bush': (P['basalt'], P['ash'])}
    root = empty('island')
    x, y, w, h = 8, 58, 344, 326  # ISLAND in RaidScene.ts
    part('cliff', slab(rrect(x, y, w, h - 4, 30), rrect(x - 4, y + 4, w + 8, h + 4, 34), -0.03, -0.4),
         C['cliff'], root, smooth=False, bevel=0.015)
    part('sand', slab(rrect(x, y, w, h - 4, 30), rrect(x, y, w, h - 4, 30), 0.0, -0.03), C['sand'], root, smooth=False)
    part('grass', slab(rrect(x + 11, y + 8, w - 22, h - 28, 22), rrect(x + 8, y + 8, w - 16, h - 22, 25), 0.035, 0.0),
         C['grass'], root, smooth=False, bevel=0.012)
    for px, py, pw, ph in ((70, 110, 70, 26), (260, 150, 80, 30), (120, 330, 90, 24), (300, 300, 50, 22), (190, 230, 110, 34)):
        if lava:  # glowing lava pools with a hot core
            part('lavapool', ground_disc(px, py, pw * 0.8, ph * 0.8, 0.036, 0.004), C['patch'], root, outline=False, emission=True)
            part('lavacore', ground_disc(px, py, pw * 0.4, ph * 0.4, 0.037, 0.004), P['lava_hot'], root, outline=False, emission=True)
        else:
            part('patch', ground_disc(px, py, pw, ph, 0.035, 0.004), C['patch'], root, outline=False)
    for r in range(7):
        for c in range(9):
            if (r * 7 + c * 3) % 4 != 0:
                part('cobble', ground_disc(48 + c * 33 + (r % 2) * 15, 92 + r * 42, 20, 11, 0.035, 0.012),
                     C['cobble'], root, outline=False)
    for tx, ty, ts in ((26, 120, 1.0), (334, 104, 1.1), (30, 300, 0.95), (336, 260, 1.0), (346, 180, 0.8)):
        if lava:
            build_spire(tx, ty, ts)
        else:
            build_tree(tx, ty, ts, snow)
    for rx, ry, rs in ((22, 210, 0.8), (340, 350, 0.9), (300, 76, 0.7), (60, 368, 0.8)):
        build_rock(rx, ry, rs, snow)
    # a small dock reaching out towards the longship
    for k in range(5):
        part('dockplank', box(scale=(0.42, 0.075 / math.sin(math.radians(ISLAND_ELEV)), 0.025), loc=L(92, 366 + k * 9, 0.03)),
             P['wood_light'] if k % 2 else P['wood'], root, smooth=False, bevel=0.006)
    for px in (72, 112):
        for py in (370, 404):
            part('post', cyl(0.025, 0.025, 0.2, seg=8, loc=L(px, py, -0.05)), P['wood_dark'], root)
    for bx, by in ((18, 160), (342, 312), (24, 352)):
        part('bush', sphere(0.12, seg=12, rings=8, cut=('above', 0), loc=L(bx, by), scale=(1.2, 1, 0.8)), C['bush'][0], root)
        part('bush2', sphere(0.08, seg=12, rings=8, cut=('above', 0), loc=L(bx + 10, by + 4), scale=(1.2, 1, 0.8)), C['bush'][1], root)
        if snow:
            part('bushsnow', sphere(0.1, seg=12, rings=8, cut=('above', 0), loc=L(bx, by, 0.05), scale=(1.2, 1, 0.45)), P['snow'], root, outline=False)
    # flowers and tufts (or ice crystals in winter) scattered along the edges, away from the loot grid
    for i, (fx, fy) in enumerate(((40, 80), (200, 66), (320, 140), (28, 250), (338, 220), (150, 372), (250, 370), (90, 70))):
        if lava:  # small flames
            part('flame', cyl(0.035, 0.0, 0.11, seg=6, loc=L(fx, fy, 0.09)), P['lava'], root, smooth=False, outline=False, emission=True)
            part('flame2', cyl(0.02, 0.0, 0.07, seg=6, loc=L(fx + 6, fy + 2, 0.07)), P['lava_hot'], root, smooth=False, outline=False, emission=True)
        elif snow:
            part('crystal', cyl(0.03, 0.0, 0.1, seg=4, loc=L(fx, fy, 0.09)), P['ice'], root, smooth=False)
            part('crystal2', cyl(0.022, 0.0, 0.07, seg=4, rot=(0, 0.5, 0), loc=L(fx + 7, fy + 2, 0.07)), P['ice_dark'], root, smooth=False)
        else:
            part('flower', sphere(0.022, seg=8, rings=6, loc=L(fx, fy, 0.05)), ('#FFFFFF', '#F5C542', '#F59B9B')[i % 3], root)
            part('tuft', cyl(0.03, 0.0, 0.06, seg=5, loc=L(fx + 9, fy + 3, 0.065)), '#4E9E3A', root, smooth=False, outline=False)
    return root


def render_island(manifest, snow=False, lava=False):
    reset_scene()
    OUTLINE_W[0] = 0.012
    build_island(snow, lava)
    res = (720, ISLAND_H * 2)
    camera((0, 0, 0), 3.6, res, elev=ISLAND_ELEV)
    name = 'island-lava' if lava else 'island-snow' if snow else 'island'
    tmp = os.path.join(TMP, 'island', f'{name}.png')
    render_to(tmp)
    rel = f'assets/island/{name}.webp'
    pack([tmp], res[0], res[1], 1, os.path.join(PUBLIC, rel))
    key = 'islandLava' if lava else 'islandSnow' if snow else 'island'
    manifest[key] = {'image': rel, 'x': 0, 'y': ISLAND_TOP, 'width': 360, 'height': ISLAND_H}


ICON_BG = '#193a4b'  # same sea blue as the game background / manifest


def render_icons():
    """App icons for the PWA: Ragnar's head on a sea-blue square (PNG, opaque)."""
    reset_scene()
    OUTLINE_W[0] = 0.013
    rig = build_viking('ragnar', 'red')
    pose_viking(rig, 'idle', 0)
    rig['root'].rotation_euler.z = math.radians(12)
    def srgb(h):
        h = h.lstrip('#')
        return np.array([int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)], dtype=np.float32)
    edge, centre = srgb(ICON_BG), srgb('#2f6a82')
    # (file, size, ortho scale): maskable icons keep the head inside the central 80 % safe zone
    jobs = [('icon-192.png', 192, 1.15), ('icon-512.png', 512, 1.15), ('icon-maskable-512.png', 512, 1.6),
            ('apple-touch-icon.png', 180, 1.25)]
    for name, size, ortho in jobs:
        for o in [o for o in bpy.data.objects if o.type == 'CAMERA']:
            bpy.data.objects.remove(o)
        camera((0, 0, 0.9), ortho, (size, size), elev=8)
        tmp = os.path.join(TMP, 'icons', name)
        render_to(tmp)
        img = bpy.data.images.load(tmp)
        px = np.empty(size * size * 4, dtype=np.float32)
        img.pixels.foreach_get(px)
        px = px.reshape(size, size, 4)
        a = px[..., 3:4]
        yy, xx = np.mgrid[0:size, 0:size] / (size - 1) - 0.5  # radial glow behind the head
        t = np.clip(np.sqrt(xx ** 2 + yy ** 2) / 0.7, 0, 1)[..., None]
        bg = centre * (1 - t) + edge * t
        out_px = np.ones_like(px)
        out_px[..., :3] = px[..., :3] * a + bg * (1 - a)
        bpy.data.images.remove(img)
        out = bpy.data.images.new('icon', size, size, alpha=True)
        out.pixels.foreach_set(out_px.ravel())
        save_image(out, os.path.join(PUBLIC, 'icons', name))
        bpy.data.images.remove(out)


def write_manifest(manifest):
    os.makedirs(os.path.dirname(MANIFEST_JSON), exist_ok=True)
    with open(MANIFEST_JSON, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, indent=2)
    body = json.dumps(manifest, indent=2)
    ts = ('// Generated by art-source/blender/render_assets.py – do not edit by hand.\n'
          'import type { AssetManifest } from \'./assets\'\n\n'
          f'export const MANIFEST: AssetManifest = {body}\n')
    with open(MANIFEST_TS, 'w', encoding='utf-8') as f:
        f.write(ts)


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    want = set(argv) or {*CHARACTERS, 'loot', 'ship', 'boats', 'island', 'island-snow', 'island-lava', 'raven'}
    if 'harald' in want:
        want |= {'harald-red', 'harald-blue', 'harald-yellow'}
    manifest = {'vikings': {}, 'loot': None, 'ship': None, 'island': None}
    if os.path.exists(MANIFEST_JSON):  # keep entries for subjects not re-rendered this run
        with open(MANIFEST_JSON, encoding='utf-8') as f:
            manifest.update(json.load(f))
    for key in CHARACTERS:
        if key in want:
            render_viking(key, manifest)
            print(f'[viking-loot] rendered {key}')
    if 'loot' in want:
        render_loot(manifest)
        print('[viking-loot] rendered loot')
    if 'ship' in want:
        render_ship(manifest)
        print('[viking-loot] rendered ship')
    if 'boats' in want:
        render_boats(manifest)
        print('[viking-loot] rendered boats')
    if 'island' in want:
        render_island(manifest)
        print('[viking-loot] rendered island')
    if 'island-snow' in want:
        render_island(manifest, snow=True)
        print('[viking-loot] rendered snowy island')
    if 'island-lava' in want:
        render_island(manifest, lava=True)
        print('[viking-loot] rendered lava island')
    if 'raven' in want:
        render_raven(manifest)
        print('[viking-loot] rendered raven')
    if 'icons' in want and argv:  # only on request: icons are not part of the game manifest
        render_icons()
        print('[viking-loot] rendered icons')
    write_manifest(manifest)
    print('[viking-loot] done')


main()
