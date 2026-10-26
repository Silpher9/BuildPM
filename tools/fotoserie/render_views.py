# Render a Blender scene (in model-frame cm) from COLMAP cameras, for photo-vs-scan comparisons.
#   blender -b scene.blend --python render_views.py -- cams.json out_dir
# cams.json: [{ n, center_cm, c2w (3x3, camera->world), camera: { model, width, height, params } }]
import bpy, json, os, sys, mathutils

argv = sys.argv[sys.argv.index('--') + 1:]
cams = json.load(open(argv[0]))
out = argv[1]
os.makedirs(out, exist_ok=True)

sc = bpy.context.scene
sc.render.engine = 'BLENDER_WORKBENCH'
sh = sc.display.shading
sh.light = 'FLAT'
sh.color_type = 'TEXTURE'
sc.render.film_transparent = False
if sc.world:
    sc.world.color = (0.42, 0.42, 0.40)
sc.render.image_settings.file_format = 'PNG'
sc.render.resolution_percentage = 100

data = bpy.data.cameras.new('fotoserie')
cam = bpy.data.objects.new('fotoserie', data)
sc.collection.objects.link(cam)
sc.camera = cam
# COLMAP looks along +Z with +Y down; a Blender camera looks along -Z with +Y up.
flip = mathutils.Matrix(((1, 0, 0), (0, -1, 0), (0, 0, -1)))

for c in cams:
    k = c['camera']
    w, h, p = k['width'], k['height'], k['params']
    f, cx, cy = (p[0], p[1], p[2]) if k['model'] in ('SIMPLE_PINHOLE', 'SIMPLE_RADIAL', 'RADIAL') else (p[0], p[2], p[3])
    big = max(w, h)
    scale = 1000 / big
    sc.render.resolution_x = round(w * scale)
    sc.render.resolution_y = round(h * scale)
    data.sensor_fit = 'HORIZONTAL' if w >= h else 'VERTICAL'
    data.sensor_width = data.sensor_height = 36
    data.lens = f / big * 36
    data.shift_x = -(cx - w / 2) / big
    data.shift_y = (cy - h / 2) / big
    data.clip_start = 5
    data.clip_end = 10000
    M = (mathutils.Matrix(c['c2w']) @ flip).to_4x4()
    M.translation = mathutils.Vector(c['center_cm'])
    cam.matrix_world = M
    sc.render.filepath = os.path.join(out, f"{c['n']}.png")
    bpy.ops.render.render(write_still=True)
    print('RENDERED', c['n'], flush=True)
