# Programmatic Pixel Insertion

This guide explains how to convert an image into SQL insert statements to populate the SusPixels canvas programmatically.

## Overview
We use a Python script leveraging the `Pillow` library to read an image, strip out pure white or transparent pixels, and translate the rest into PostgreSQL `INSERT` statements with `ON CONFLICT` constraints. This ensures that inserting large pixel batches is performant and gracefully overwrites any existing pixels on the canvas.

## Prerequisites
1. Python 3 installed
2. `Pillow` library (`pip install Pillow`)
3. Access to the production PostgreSQL database.
4. Redis CLI access (to flush the cache so new pixels appear).

## The Python Script

Save the following script as `generate_sql.py`.

```python
import sys
from PIL import Image

def generate_sql(image_path, out_file, start_x, start_y, scale=1, user_id=None):
    img = Image.open(image_path)
    img = img.convert('RGBA')
    
    total_pixels = 0
    with open(out_file, 'w') as f:
        f.write("BEGIN;\n")
        
        batch_size = 5000
        values = []
        
        for y in range(0, img.height, scale):
            for x in range(0, img.width, scale):
                r, g, b, a = img.getpixel((x, y))
                
                # Only insert pixels that are not fully transparent
                if a > 0:
                    hex_color = f"#{r:02x}{g:02x}{b:02x}"
                    
                    # Skip white pixels as the canvas is already white
                    if hex_color == '#ffffff':
                        continue
                        
                    if user_id:
                        values.append(f"({(x // scale) + start_x}, {(y // scale) + start_y}, '{hex_color}', '{user_id}')")
                    else:
                        values.append(f"({(x // scale) + start_x}, {(y // scale) + start_y}, '{hex_color}')")
                    total_pixels += 1
                    
                # Batch inserts to avoid blowing up memory
                if len(values) >= batch_size:
                    if user_id:
                        f.write("INSERT INTO pixels (x, y, color, updated_by) VALUES\n")
                        f.write(",\n".join(values))
                        f.write("\nON CONFLICT (x, y) DO UPDATE SET color = EXCLUDED.color, updated_by = EXCLUDED.updated_by;\n")
                    else:
                        f.write("INSERT INTO pixels (x, y, color) VALUES\n")
                        f.write(",\n".join(values))
                        f.write("\nON CONFLICT (x, y) DO UPDATE SET color = EXCLUDED.color;\n")
                    values = []
                    
        # Flush remaining
        if values:
            if user_id:
                f.write("INSERT INTO pixels (x, y, color, updated_by) VALUES\n")
                f.write(",\n".join(values))
                f.write("\nON CONFLICT (x, y) DO UPDATE SET color = EXCLUDED.color, updated_by = EXCLUDED.updated_by;\n")
            else:
                f.write("INSERT INTO pixels (x, y, color) VALUES\n")
                f.write(",\n".join(values))
                f.write("\nON CONFLICT (x, y) DO UPDATE SET color = EXCLUDED.color;\n")
            
        f.write("COMMIT;\n")
    
    print(f"SQL file generated at {out_file}!")
    print(f"Total pixels processed: {total_pixels}")

if __name__ == '__main__':
    if len(sys.argv) < 5:
        print("Usage: python generate_sql.py <image_path> <out_file.sql> <start_x> <start_y> [scale] [user_id]")
        sys.exit(1)
        
    image_path = sys.argv[1]
    out_file = sys.argv[2]
    start_x = int(sys.argv[3])
    start_y = int(sys.argv[4])
    scale = int(sys.argv[5]) if len(sys.argv) > 5 else 1
    user_id = sys.argv[6] if len(sys.argv) > 6 else None
    
    generate_sql(image_path, out_file, start_x, start_y, scale, user_id)
```

## Step-by-Step Guide

### 1. Identify the Target User ID
If you want the placed pixels to be attributed to a specific user, find their UUID in the database:
```sql
SELECT id FROM users WHERE email = 'your-email@example.com';
```

### 2. Generate the SQL File
Run the script to convert the image into an SQL script. 

> **Note on Scaling:**
> If you have a large image (e.g., 2000x2000), you will generate 4 million pixels! To reduce load and physical dimensions, pass a `scale` factor. For instance, a scale of `4` will sample every 4th pixel, effectively reducing the area to 1/16th of its original size.

```bash
python generate_sql.py art.png output.sql <START_X> <START_Y> <SCALE> <USER_ID>
```
*Example:*
```bash
python generate_sql.py art.png output.sql 1014 1291 7 "5d9ee015-9d54-482d-b043-91db3965096d"
```

### 3. Execute the SQL
Run the generated file against the production database:
```bash
psql 'YOUR_CONNECTION_STRING' -f output.sql
```

### 4. Flush Redis Cache
The frontend pulls canvas data from a Redis cache. For the new pixels to show up immediately without waiting for the cache to invalidate naturally, run:
```bash
redis-cli -u 'YOUR_REDIS_URL' FLUSHALL
```
