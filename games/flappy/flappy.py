import random
import pygame

W, H = 400, 600
GROUND = H - 60
BIRD_X, BIRD_R = 90, 14
GRAVITY, FLAP = 0.45, -7.2
PIPE_W, GAP, SPEED, SPAWN = 70, 150, 2.6, 90
BG, GROUND_C, PIPE_C, BIRD_C = "#0e1420", "#1a2233", "#2dd4bf", "#fbbf24"

pygame.init()
screen = pygame.display.set_mode((W, H))
pygame.display.set_caption("flappy")
clock = pygame.time.Clock()
font = pygame.font.Font(None, 28)


def reset():
    global state, bird_y, vel, pipes, score, frames
    state, bird_y, vel, pipes, score, frames = "ready", H / 2, 0.0, [], 0, 0


def flap():
    global state, vel
    if state == "over":
        reset()
    else:
        state = "play"
        vel = FLAP


def text(msg, y):
    img = font.render(msg, True, "white")
    screen.blit(img, ((W - img.get_width()) / 2, y))


best = 0
reset()

while True:
    for e in pygame.event.get():
        if e.type == pygame.QUIT:
            pygame.quit()
            raise SystemExit
        if e.type == pygame.MOUSEBUTTONDOWN or (e.type == pygame.KEYDOWN and e.key == pygame.K_SPACE):
            flap()

    if state == "play":
        frames += 1
        vel += GRAVITY
        bird_y += vel
        if frames % SPAWN == 0:
            pipes.append({"x": W, "top": random.uniform(60, GROUND - 60 - GAP), "scored": False})
        for p in pipes:
            p["x"] -= SPEED
            if not p["scored"] and p["x"] + PIPE_W < BIRD_X:
                p["scored"] = True
                score += 1
        pipes = [p for p in pipes if p["x"] >= -80]
        hit = bird_y + BIRD_R > GROUND or bird_y - BIRD_R < 0
        for p in pipes:
            if (BIRD_X + BIRD_R > p["x"] and BIRD_X - BIRD_R < p["x"] + PIPE_W
                    and (bird_y - BIRD_R < p["top"] or bird_y + BIRD_R > p["top"] + GAP)):
                hit = True
        if hit:
            best = max(best, score)
            state = "over"

    screen.fill(BG)
    for p in pipes:
        pygame.draw.rect(screen, PIPE_C, (p["x"], 0, PIPE_W, p["top"]))
        pygame.draw.rect(screen, PIPE_C, (p["x"], p["top"] + GAP, PIPE_W, GROUND - p["top"] - GAP))
    pygame.draw.rect(screen, GROUND_C, (0, GROUND, W, H - GROUND))
    pygame.draw.circle(screen, BIRD_C, (BIRD_X, bird_y), BIRD_R)
    screen.blit(font.render(str(score), True, "white"), (20, 40))
    if state == "ready":
        text("press space", H / 2 - 60)
    elif state == "over":
        text("game over", H / 2 - 90)
        text(f"score {score}  best {best}", H / 2 - 60)
        text("space to restart", H / 2 - 30)
    pygame.display.flip()
    clock.tick(60)
