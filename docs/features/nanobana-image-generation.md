# NanoBanana Image Generation (standalone CLI tool)

## Overview
NanoBanana Studio is a CLI image generation tool using Gemini 2.5 Flash Image. It generates photo-realistic scenes, device mockups, vector illustrations, and brand-researched images from the terminal. Use it whenever a project needs custom imagery — hero photos, project showcase cards, team photos, product mockups, icons, or social media assets.

## Architecture
- **Standalone Python package** at `/Users/andrewwadsworth/Projects/nanobana/`
- Installed globally via `pip install -e /Users/andrewwadsworth/Projects/nanobana`
- CLI command `nanobana` available from any project directory
- Zero runtime dependencies (Python 3 stdlib only)
- API: Gemini 2.5 Flash Image (`gemini-2.5-flash-image`), max 3 reference images per request
- Output: images saved relative to current working directory

## Dependencies
- Python 3.8+
- Gemini API key (set via `GEMINI_API_KEY` env var, `.env` in cwd, or `~/.nanobana/.env`)
- No pip packages required (all stdlib)

## Environment Variables
| Variable | Required | Description |
|----------|----------|-------------|
| `GEMINI_API_KEY` | Yes | Google Gemini API key. Get one at https://aistudio.google.com/apikey |

API key resolution order:
1. `GEMINI_API_KEY` environment variable
2. `.env` file in current working directory
3. `~/.nanobana/.env` (global config)

## 6 Commands

| Command | Purpose |
|---------|---------|
| `nanobana generate` | Generate image from text prompt + optional reference images |
| `nanobana mockup` | Place a screenshot onto a device (laptop/phone) in a lifestyle scene |
| `nanobana person` | Multi-step photo-realistic person generation with character consistency |
| `nanobana vector` | Generate vector/illustration style images (flat, isometric, icons, patterns) |
| `nanobana brand` | Research a brand's colours/fonts from their website URL |
| `nanobana templates` | List all 18 available prompt templates |

## 18 Prompt Templates

| Category | Templates |
|----------|-----------|
| **People (5)** | `portrait`, `lifestyle_person`, `over_shoulder`, `team_photo`, `character_anchor` |
| **Mockup (4)** | `laptop_desk`, `phone_hand`, `multi_device`, `flat_lay` |
| **Vector (5)** | `flat_vector`, `infographic`, `icon_set`, `decorative_pattern`, `isometric` |
| **Brand (3)** | `product_hero`, `brand_lifestyle`, `social_media` |
| **Utility (1)** | `brand_brief` |

## Common Workflows

### 1. Device Mockup from App Screenshot

When showcasing an app you built — place a real screenshot on a device in a lifestyle scene.

```bash
# Save reference screenshot, then:
nanobana mockup --ref screenshot.png --device laptop --scene "bright home office" --output project-hero.png --aspect 4:3

# Phone mockup
nanobana mockup --ref mobile-screenshot.png --device phone --output app-preview.png

# Both devices
nanobana mockup --ref screenshot.png --device both --brand-colours "#009B9B" --output multi-device.png
```

### 2. Photo-Realistic Lifestyle Scene

When you need a realistic photo with people using a product — pass a screenshot as reference so the real UI appears on screen.

```bash
nanobana generate \
  --ref screenshot.png \
  --prompt "A photo-realistic candid scene of a person at a modern desk viewing the exact interface from the reference image on their laptop. Shot with 35mm lens at f/2.8, natural window lighting, documentary realism." \
  --output lifestyle.png --aspect 4:3
```

### 3. Brand Research + Image Generation

When creating images for a client whose brand you don't know — scrape their website first.

```bash
# Research brand colours/fonts
nanobana brand --url https://clientwebsite.com --save brand.json

# Generate with brand brief prepended
nanobana generate --brand-url https://clientwebsite.com --prompt "A professional hero image" --output hero.png
```

### 4. Vector Illustrations

```bash
# Flat vector
nanobana vector --subject "team collaboration" --colors "#e9484d,#0f1128,#ef9563" --output illustration.png

# Icon set
nanobana vector --style icons --subject "dashboard, analytics, settings, users" --output icons.png

# Isometric
nanobana vector --style isometric --subject "a modern SaaS workspace" --output isometric.png
```

### 5. Multi-Step Person (Character Consistency)

```bash
# Step 1-2: Analyse reference + generate portrait
nanobana person --ref original-photo.png --output person-v1.png

# Step 3: Refine with both images as reference
nanobana person --ref original-photo.png person-v1.png --output person-v2.png
```

## Prompt Engineering Rules

### DO:
- **Narrative descriptions** — write a scene, not a keyword list
- **Camera specifics** — "Shot with 85mm lens at f/1.4" (creates natural proportions)
- **Imperfections** — "natural pores, slight asymmetry, film grain" (avoids AI look)
- **Hex codes** — "#e9484d for accent elements" (exact colour control)
- **Genuine moments** — "mid-laugh", "focused on screen" (not stiff poses)

### DON'T:
- **No keyword spam** — "4k, trending, masterpiece" = unnecessary
- **No negative prompts** — describe what you DO want instead
- **No vague colours** — "brand colours" fails; "#289A47 green accents" works

## Supported Aspect Ratios
`1:1`, `3:2`, `2:3`, `3:4`, `4:3`, `4:5`, `5:4`, `9:16`, `16:9`, `21:9`

## API Reference
- **Model:** `gemini-2.5-flash-image`
- **Max reference images:** 3
- **Image sizes:** 1K (default, up to 1024px), 2K
- **Cost:** ~$0.039 per image
- **Timeout:** 180s default (configurable with `--timeout`)
- **Retries:** 2 automatic retries on failure/rate-limit

## Clipboard Shortcut (macOS)

Save a system clipboard screenshot to file:
```bash
osascript -e 'try
    set imageFile to (POSIX path of "/path/to/reference.png")
    set theClipboard to the clipboard as «class PNGf»
    set fileRef to open for access imageFile with write permission
    write theClipboard to fileRef
    close access fileRef
end try'
```
Note: Only works with system clipboard, not images pasted into VS Code chat.

## Gotchas & Lessons Learned
- **Phone screens must be realistic size** — first FilterMax attempt had an oversized phone. Use narrative prompts describing natural use, not "holding phone to camera"
- **Don't let AI reimagine reference screenshots** — explicitly say "Keep the screenshot EXACTLY as it is — do not modify, redraw, or reimagine any part of the UI"
- **Aspect ratio must match usage** — Work page cards need 4:3 landscape, hero banners need 16:9, social posts need 1:1
- **VS Code chat pastes don't update system clipboard** — use the clipboard trick only when the image was copied via Cmd+C or screenshot tool
- **Leaked API keys get blocked** — never commit API keys; use `~/.nanobana/.env` for global config

## Programmatic Usage (Python)

```python
from nanobana import generate_image, save_image, fill_template, research_brand

# Generate with a custom prompt
image_data, ext = generate_image("A red circle on white", aspect_ratio="1:1")
if image_data:
    save_image(image_data, "output.png", ext)

# Use a template
prompt = fill_template("laptop_desk", scene_details="A bright co-working space")
image_data, ext = generate_image(prompt, reference_images=["screenshot.png"])

# Research a brand
brand = research_brand("https://example.com")
print(brand["brand_brief"])
```
