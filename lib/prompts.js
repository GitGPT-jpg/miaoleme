// 生成提示词（纯数据，不依赖 Electron）：主进程与 tools/gen-frames.js 共用一份，
// 避免两边各抄一份后漂移（曾经工具里的提示词少了「四条腿/一条尾巴」的约束）。
const { RUN_FRAMES } = require('./run');

const IDLE = 'Turn the person/pet/subject in this photo into an adorable chibi 3D mascot character, Pixar/Blender toy-figure style, big round head, large glossy expressive eyes, soft shading, keep the subject\'s key colors and recognizable features. Full body standing in a cute 3/4 front pose, soft studio lighting with subtle rim light, glossy clean render. Anatomically correct, exactly four legs and one tail, natural feline pose. Isolated on a FULLY TRANSPARENT background, PNG, subject centered, no ground, no baked shadow, high detail.';

const WALK = 'Turn the person/pet/subject in this photo into an adorable chibi 3D mascot character, Pixar/Blender toy-figure style, big round head, large glossy eyes, keep the subject\'s key colors and recognizable features. Full body in a cute MID-WALK stride pose seen from a side 3/4 angle, one foot/paw lifted forward, playful happy expression, soft studio lighting, glossy clean render. Anatomically correct, exactly four legs and one tail, natural feline pose. Isolated on a FULLY TRANSPARENT background, PNG, subject centered, no ground, no baked shadow, high detail.';

// 骨骼部件提示词（同一角色，透明底，便于 Canvas 绑定）
const RIG = {
  'rig-body': 'Isolated cat BODY ONLY for 2D rigging, same cat as the photo: full torso standing in side profile, four legs included, NO head, NO tail, neck and hip stumps, soft plush 3D Pixar style, transparent background PNG, centered, no shadow.',
  'rig-head': 'Isolated cat HEAD ONLY for 2D rigging, same cat as the photo: head neutral expression, front three-quarter view, neck stump, eyes open looking forward, soft plush 3D Pixar style, transparent background PNG, centered, no body, no shadow.',
  'rig-tail': 'Isolated fluffy cat TAIL ONLY for 2D rigging, same cat as the photo: tail in a soft S curve, root at bottom left, soft plush 3D Pixar style, transparent background PNG, centered, no body, no shadow.',
  'rig-head-blink': 'Isolated cat HEAD ONLY for 2D rigging, same cat as the photo: head with EYES CLOSED (blinking), relaxed expression, front three-quarter view, neck stump, soft plush 3D Pixar style, transparent background PNG, centered, no body, no shadow.',
  'rig-head-ears': 'Isolated cat HEAD ONLY for 2D rigging, same cat as the photo: head with EARS FLATTENED BACK, alert expression, front three-quarter view, neck stump, soft plush 3D Pixar style, transparent background PNG, centered, no body, no shadow.'
};

// 动作帧提示词（通用主体，保持同一画风与透明底）
const ACTIONS = {
  roll:  'Turn the subject in this photo into an adorable chibi 3D mascot, Pixar/Blender style, keep key colors and features. Pose: rolling on its back playfully, belly up, limbs up in the air, happy relaxed expression. Anatomically correct cat: four legs and one tail, no extra limbs. Isolated on a FULLY TRANSPARENT background, PNG, centered, no ground, no baked shadow.',
  groom: 'Turn the subject in this photo into an adorable chibi 3D mascot, Pixar/Blender style, keep key colors and features. Pose: sitting and grooming itself, cute focused expression. Anatomically correct cat: four legs and one tail, no extra limbs. Isolated on a FULLY TRANSPARENT background, PNG, centered, no ground, no baked shadow.',
  eat:   'Turn the subject in this photo into an adorable chibi 3D mascot, Pixar/Blender style, keep key colors and features. Pose: head lowered eating from a small round food bowl placed in front, happy eating expression. Anatomically correct cat: four legs and one tail, no extra limbs. Isolated on a FULLY TRANSPARENT background, PNG, centered, no ground, no baked shadow.',
  sleep: 'Turn the subject in this photo into an adorable chibi 3D mascot, Pixar/Blender style, keep key colors and features. Pose: lying down curled up sleeping, eyes closed peacefully, small white Zzz symbols floating above head. Anatomically correct cat: four legs and one tail, no extra limbs. Isolated on a FULLY TRANSPARENT background, PNG, centered, no ground, no baked shadow.',
  drink: 'Turn the subject in this photo into an adorable chibi 3D mascot, Pixar/Blender style, keep key colors and features. Pose: head lowered drinking water from a small round water bowl in front, tiny tongue lapping, happy contented expression. Anatomically correct cat: four legs and one tail, no extra limbs. Isolated on a FULLY TRANSPARENT background, PNG, centered, no ground, no baked shadow.',
  stretch: 'Turn the subject in this photo into an adorable chibi 3D mascot, Pixar/Blender style, keep key colors and features. Pose: a big stretch after a nap — front legs reaching far forward flat on the ground, chest lowered, hips raised high, back curved in a deep arch, eyes squinted contentedly, tail up. Anatomically correct cat: four legs and one tail, no extra limbs. Isolated on a FULLY TRANSPARENT background, PNG, centered, no ground, no baked shadow.'
};

// 奔跑序列提示词：公共前缀锁死「侧视朝右 + 身体水平 + 同一机位/比例/基线 + 透明底」，
// 8 个姿势构成一个完整步态循环（收拢 ↔ 伸展交替；A/B 两相由不同对角腿领跑）。
// 每帧是独立一次生成，模型看不到别的帧，所以不能写「mirror of DOWN-A」这类跨帧指代，
// 必须把每条腿的位置直接写清楚。
const RUN_PREFIX = 'Turn the cat in this photo into the SAME adorable chibi 3D mascot as the reference idle image (Pixar/Blender toy style, identical fur colors, markings, eye color, proportions). STRICT SIDE VIEW facing RIGHT, the body axis is perfectly HORIZONTAL (no pitch, no tilt). Same camera, same scale, same canvas size, feet on the same ground baseline and head at roughly the same height above that baseline in every frame. Anatomically correct: exactly four legs and one tail. Isolated on a FULLY TRANSPARENT background, PNG, no ground, no baked shadow, no motion blur, no speed lines.\nPose: ';
const RUN_POSES = [
  'CONTACT-A: the RIGHT front paw is planted on the ground reaching forward, the LEFT front leg trails back under the chest, the LEFT hind paw is still pushing off behind, the RIGHT hind leg swings forward under the belly. Chest low, body only MODERATELY extended (body length about 1.6x shoulder height), head forward and level.',
  'DOWN-A: weight sits over the planted RIGHT front paw, the LEFT front leg is lifted just off the ground, shoulders compressed, chest lowered, both hind legs gathering forward under the belly, body SHORT (body length about 1.3x shoulder height).',
  'PASSING-A: the most COMPACT frame of the cycle — all four paws bunched close together under the belly, back arched upward like a bow, body VERY SHORT (body length about 1.1x shoulder height), tail low.',
  'FLIGHT-A: the LONGEST frame of the cycle — both front legs stretched far forward, both hind legs stretched far back, all four paws off the ground, spine long and flat, tail streaming straight back.',
  'CONTACT-B: the LEFT front paw is planted on the ground reaching forward, the RIGHT front leg trails back under the chest, the RIGHT hind paw is still pushing off behind, the LEFT hind leg swings forward under the belly. Chest low, body only MODERATELY extended (body length about 1.6x shoulder height), head forward and level.',
  'DOWN-B: weight sits over the planted LEFT front paw, the RIGHT front leg is lifted just off the ground, shoulders compressed, chest lowered, both hind legs gathering forward under the belly, body SHORT (body length about 1.3x shoulder height).',
  'PASSING-B: the most COMPACT frame of the cycle — all four paws bunched close together under the belly, back arched upward like a bow, body VERY SHORT (body length about 1.1x shoulder height), tail curling low.',
  'FLIGHT-B: the LONGEST frame of the cycle — both front legs stretched far forward and slightly higher, both hind legs stretched far back, all four paws off the ground, spine long and flat, tail streaming straight back.'
];
const RUN_KEYS = RUN_POSES.map((_, i) => `run-${i + 1}`);
// useIdleRef：跑步帧额外带上已生成的站立帧做参考，锁住同一只猫的颜色/花纹/比例
const RUN_TASKS = RUN_POSES.map((pose, i) => ({
  key: RUN_KEYS[i],
  prompt: RUN_PREFIX + pose,
  label: `奔跑 ${i + 1}/${RUN_FRAMES}`,
  useIdleRef: true
}));

module.exports = { IDLE, WALK, RIG, ACTIONS, RUN_PREFIX, RUN_POSES, RUN_KEYS, RUN_TASKS };
