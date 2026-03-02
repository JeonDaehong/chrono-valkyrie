"""
임시 도트 스프라이트 생성기
pillow 필요: pip install pillow
"""
from PIL import Image, ImageDraw
import os

OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'assets', 'sprites')
os.makedirs(OUT, exist_ok=True)

def save(img, name):
    img.save(os.path.join(OUT, name))
    print(f'  saved {name}')

# ─── 팔레트 ──────────────────────────────────────────────────────────────
TRANSPARENT = (0, 0, 0, 0)
BLACK  = (0, 0, 0, 255)
WHITE  = (255, 255, 255, 255)
SKIN   = (220, 170, 120, 255)
DARK_SKIN = (180, 120, 80, 255)
HAIR   = (60, 30, 10, 255)
SHIRT  = (60, 100, 200, 255)
PANTS  = (40, 50, 80, 255)
BOOTS  = (50, 30, 10, 255)
SWORD  = (180, 200, 220, 255)
SWORD_SHINE = (240, 250, 255, 255)

GOLEM_BODY = (90, 90, 110, 255)
GOLEM_DARK = (50, 50, 70, 255)
GOLEM_LIGHT= (140, 140, 160, 255)
GOLEM_EYE  = (255, 80, 80, 255)
GOLEM_CRACK= (30, 30, 50, 255)

BULLET_P   = (100, 220, 255, 255)
BULLET_B   = (255, 80, 60, 255)
SLASH_C    = (255, 255, 150, 200)

# ─── 플레이어 스프라이트시트 (16×16 × 24 프레임) ─────────────────────────
# 레이아웃: 각 행 = 방향별 4프레임
# Row 0: 아래 이동 (0-3)
# Row 1: 옆 이동  (4-7)
# Row 2: 위 이동  (8-11)
# Row 3: 근접 공격 (12-15)
# Row 4: 구르기   (16-19)
# Row 5: 피격     (20-23)

W, H = 16, 16
COLS = 4
ROWS = 6

def draw_player_frame(draw: ImageDraw.ImageDraw, ox: int, oy: int, variant: int, direction: str):
    """도트 플레이어 한 프레임 그리기"""
    # 몸통
    draw.rectangle([ox+4, oy+6, ox+11, oy+12], fill=SHIRT)
    # 바지
    draw.rectangle([ox+4, oy+12, ox+11, oy+14], fill=PANTS)
    # 부츠
    draw.rectangle([ox+4, oy+14, ox+6, oy+15], fill=BOOTS)
    draw.rectangle([ox+9, oy+14, ox+11, oy+15], fill=BOOTS)

    # 머리 (방향별)
    if direction in ('down', 'side'):
        draw.rectangle([ox+4, oy+2, ox+11, oy+7], fill=SKIN)
        draw.rectangle([ox+4, oy+1, ox+11, oy+3], fill=HAIR)
        draw.point([(ox+6, oy+5), (ox+9, oy+5)], fill=BLACK)  # 눈
    elif direction == 'up':
        draw.rectangle([ox+4, oy+2, ox+11, oy+7], fill=DARK_SKIN)
        draw.rectangle([ox+4, oy+1, ox+11, oy+4], fill=HAIR)

    # 팔 (애니메이션 variant)
    arm_offset = [0, 1, 0, -1][variant % 4]
    draw.rectangle([ox+2, oy+6+arm_offset, ox+4, oy+9+arm_offset], fill=SKIN)
    draw.rectangle([ox+11, oy+6+arm_offset, ox+13, oy+9+arm_offset], fill=SKIN)

    # 칼 (오른팔)
    if direction != 'up':
        draw.rectangle([ox+12, oy+5+arm_offset, ox+13, oy+11+arm_offset], fill=SWORD)
        draw.point([(ox+12, oy+5+arm_offset)], fill=SWORD_SHINE)

    # 다리 보행 애니메이션
    leg_split = [0, 2, 0, -2][variant % 4]
    draw.rectangle([ox+4, oy+12, ox+7, oy+14], fill=PANTS)
    draw.rectangle([ox+8, oy+12, ox+11, oy+14], fill=PANTS)
    draw.rectangle([ox+4, oy+14, ox+6, oy+15], fill=BOOTS)
    draw.rectangle([ox+9, oy+14, ox+11, oy+15], fill=BOOTS)

def create_player_sheet():
    sheet = Image.new('RGBA', (W * COLS, H * ROWS), TRANSPARENT)
    draw = ImageDraw.Draw(sheet)

    directions = ['down', 'side', 'up', 'attack', 'roll', 'hurt']
    for row, direction in enumerate(directions):
        for col in range(COLS):
            ox, oy = col * W, row * H
            # 기본 배경 없음
            if direction == 'attack':
                draw_player_frame(draw, ox, oy, col, 'side')
                # 공격 모션: 팔 앞으로
                draw.rectangle([ox+12, oy+4, ox+15, oy+8], fill=SWORD)
                draw.point([(ox+15, oy+4)], fill=SWORD_SHINE)
            elif direction == 'roll':
                # 구르기: 몸 기울임
                draw.rectangle([ox+3, oy+7, ox+12, oy+13], fill=SHIRT)
                draw.rectangle([ox+3, oy+5, ox+10, oy+9], fill=SKIN)
                draw.rectangle([ox+3, oy+4, ox+10, oy+6], fill=HAIR)
            elif direction == 'hurt':
                draw_player_frame(draw, ox, oy, 0, 'down')
                # 빨간 틴트 효과 대신 팔 올림
                draw.rectangle([ox+2, oy+4, ox+4, oy+8], fill=SKIN)
                draw.rectangle([ox+11, oy+4, ox+13, oy+8], fill=SKIN)
            else:
                draw_player_frame(draw, ox, oy, col, direction)

    save(sheet, 'player.png')

# ─── 보스 골렘 스프라이트시트 (32×32 × 16 프레임) ─────────────────────
BW, BH = 32, 32
B_COLS = 4
B_ROWS = 4

def draw_golem_frame(draw: ImageDraw.ImageDraw, ox: int, oy: int, variant: int, state: str):
    # 몸통 (커다란 사각형 느낌)
    draw.rectangle([ox+6, oy+10, ox+25, oy+28], fill=GOLEM_BODY)
    draw.rectangle([ox+8, oy+12, ox+23, oy+26], fill=GOLEM_DARK)
    # 균열 무늬
    draw.line([(ox+10, oy+14), (ox+14, oy+20)], fill=GOLEM_CRACK, width=1)
    draw.line([(ox+18, oy+13), (ox+22, oy+19)], fill=GOLEM_CRACK, width=1)

    # 머리
    draw.rectangle([ox+8, oy+3, ox+23, oy+12], fill=GOLEM_BODY)
    draw.rectangle([ox+10, oy+5, ox+21, oy+10], fill=GOLEM_DARK)

    # 눈 (빨간 발광)
    eye_y = oy + 6 + ([0,1,0,-1][variant % 4] if state == 'attack' else 0)
    draw.rectangle([ox+10, eye_y, ox+13, eye_y+3], fill=GOLEM_EYE)
    draw.rectangle([ox+18, eye_y, ox+21, eye_y+3], fill=GOLEM_EYE)
    draw.point([(ox+11, eye_y+1), (ox+19, eye_y+1)], fill=(255, 180, 180, 255))

    # 팔
    arm_y = [0, 1, 0, -1][variant % 4] if state == 'idle' else [-2, -4, -2, 0][variant % 4]
    draw.rectangle([ox+1, oy+10+arm_y, ox+6, oy+22+arm_y], fill=GOLEM_BODY)
    draw.rectangle([ox+25, oy+10+arm_y, ox+30, oy+22+arm_y], fill=GOLEM_BODY)
    draw.rectangle([ox+2, oy+12+arm_y, ox+5, oy+20+arm_y], fill=GOLEM_DARK)
    draw.rectangle([ox+26, oy+12+arm_y, ox+29, oy+20+arm_y], fill=GOLEM_DARK)

    # 다리
    draw.rectangle([ox+8, oy+27, ox+13, oy+31], fill=GOLEM_BODY)
    draw.rectangle([ox+18, oy+27, ox+23, oy+31], fill=GOLEM_BODY)

    # 어깨 파츠
    draw.rectangle([ox+3, oy+8, ox+9, oy+13], fill=GOLEM_LIGHT)
    draw.rectangle([ox+22, oy+8, ox+28, oy+13], fill=GOLEM_LIGHT)

def create_golem_sheet():
    sheet = Image.new('RGBA', (BW * B_COLS, BH * B_ROWS), TRANSPARENT)
    draw = ImageDraw.Draw(sheet)
    states = ['idle', 'attack', 'hurt', 'death']

    for row, state in enumerate(states):
        for col in range(B_COLS):
            ox, oy = col * BW, row * BH
            if state == 'death':
                # 쓰러지는 모션
                progress = col / 3
                cy = int(oy + progress * 10)
                draw.rectangle([ox+3, cy+15, ox+28, cy+30], fill=GOLEM_DARK)
                draw.rectangle([ox+5, cy+10, ox+26, cy+20], fill=GOLEM_BODY)
                draw.rectangle([ox+8, cy+6, ox+23, cy+14], fill=GOLEM_DARK)
                alpha = int(255 * (1 - progress * 0.7))
            else:
                draw_golem_frame(draw, ox, oy, col, state)

    save(sheet, 'boss_golem.png')

# ─── 투사체 ────────────────────────────────────────────────────────────
def create_projectile(name: str, color: tuple, size: int = 8, glow: bool = True):
    img = Image.new('RGBA', (size, size), TRANSPARENT)
    draw = ImageDraw.Draw(img)
    r = size // 2
    cx, cy = r, r

    # 외곽 글로우
    if glow:
        glow_color = (color[0], color[1], color[2], 80)
        draw.ellipse([cx-r, cy-r, cx+r-1, cy+r-1], fill=glow_color)

    # 코어
    core = size // 3
    draw.ellipse([cx-core, cy-core, cx+core, cy+core], fill=color)
    # 하이라이트
    draw.ellipse([cx-1, cy-1, cx+1, cy+1], fill=WHITE)

    save(img, name)

# ─── 슬래시 이펙트 ────────────────────────────────────────────────────
def create_slash():
    img = Image.new('RGBA', (24, 24), TRANSPARENT)
    draw = ImageDraw.Draw(img)
    # 호 모양 슬래시
    for i in range(3):
        alpha = 200 - i * 50
        c = (255, 255, 100, alpha)
        draw.arc([2+i*2, 2+i*2, 21-i*2, 21-i*2], start=200, end=340, fill=c, width=2)
    draw.line([(4, 20), (20, 4)], fill=(255, 255, 200, 220), width=2)
    save(img, 'slash_effect.png')

# ─── 타일 ─────────────────────────────────────────────────────────────
def create_floor_tile():
    img = Image.new('RGBA', (16, 16), (35, 32, 48, 255))
    draw = ImageDraw.Draw(img)
    # 그리드 라인
    draw.line([(0, 0), (15, 0)], fill=(45, 42, 60, 255))
    draw.line([(0, 0), (0, 15)], fill=(45, 42, 60, 255))
    # 노이즈 점
    for pos in [(3,3),(7,11),(12,5),(5,13),(10,8)]:
        draw.point([pos], fill=(30, 28, 42, 255))
    save(img, 'floor_tile.png')

def create_wall_tile():
    img = Image.new('RGBA', (16, 16), (55, 50, 75, 255))
    draw = ImageDraw.Draw(img)
    draw.rectangle([0,0,15,3], fill=(70, 65, 90, 255))   # 상단 하이라이트
    draw.rectangle([0,12,15,15], fill=(30, 28, 45, 255)) # 하단 그림자
    draw.line([(4,4),(11,4)], fill=(40,38,58,255))
    draw.line([(4,8),(11,8)], fill=(40,38,58,255))
    save(img, 'wall_tile.png')

# ─── 파티클 ────────────────────────────────────────────────────────────
def create_particle(name: str, color: tuple):
    img = Image.new('RGBA', (4, 4), TRANSPARENT)
    draw = ImageDraw.Draw(img)
    draw.rectangle([0,0,3,3], fill=color)
    draw.point([(0,0),(3,0),(0,3),(3,3)], fill=TRANSPARENT)
    save(img, name)

# ─── 실행 ──────────────────────────────────────────────────────────────
if __name__ == '__main__':
    print('Generating sprites...')
    create_player_sheet()
    create_golem_sheet()
    create_projectile('projectile_player.png', BULLET_P)
    create_projectile('projectile_boss.png', BULLET_B, size=10)
    create_slash()
    create_floor_tile()
    create_wall_tile()
    create_particle('particle_hit.png', (255, 200, 100, 255))
    create_particle('particle_blood.png', (200, 50, 50, 255))
    print('Done!')
