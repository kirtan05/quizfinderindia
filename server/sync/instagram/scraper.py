#!/usr/bin/env python3
"""
Fetch recent Instagram posts from tracked quizzing pages.
Called by Node.js via child_process. Outputs JSON to stdout.

Usage: python3 scraper.py [--days 7] [--login username]
"""
import json
import sys
import time
import random
import argparse
import uuid
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

import instaloader


def main():
    parser = argparse.ArgumentParser(description='Scrape Instagram quiz pages')
    parser.add_argument('--days', type=int, default=7, help='Fetch posts from last N days')
    parser.add_argument('--login', type=str, default=None, help='Instagram username for session')
    parser.add_argument('--pages', type=str, default=None, help='Path to pages.json')
    args = parser.parse_args()

    script_dir = Path(__file__).parent
    pages_path = Path(args.pages) if args.pages else script_dir / 'pages.json'
    posters_dir = script_dir.parent.parent / 'data' / 'posters'
    posters_dir.mkdir(parents=True, exist_ok=True)

    with open(pages_path) as f:
        pages = json.load(f)

    L = instaloader.Instaloader(
        download_pictures=False,
        download_videos=False,
        download_video_thumbnails=False,
        download_geotags=False,
        download_comments=False,
        save_metadata=False,
        compress_json=False,
        quiet=True,
    )

    # Load saved session if available
    if args.login:
        try:
            L.load_session_from_file(args.login)
            print(f"Loaded session for {args.login}", file=sys.stderr)
        except FileNotFoundError:
            print(f"No saved session for {args.login}. Run: instaloader --login {args.login}", file=sys.stderr)
            print("Continuing without login (lower rate limits).", file=sys.stderr)

    cutoff = datetime.now(timezone.utc) - timedelta(days=args.days)
    results = []
    errors = []

    for i, page in enumerate(pages):
        username = page['username']
        city = page.get('city', None)

        try:
            profile = instaloader.Profile.from_username(L.context, username)
            page_posts = 0

            for post in profile.get_posts():
                post_date = post.date_utc
                if post_date.tzinfo is None:
                    post_date = post_date.replace(tzinfo=timezone.utc)
                if post_date < cutoff:
                    break

                # Download image
                image_filename = None
                if post.url:
                    try:
                        image_filename = f"{uuid.uuid4()}.jpg"
                        image_path = posters_dir / image_filename
                        urllib.request.urlretrieve(post.url, str(image_path))
                    except Exception as e:
                        print(f"  Failed to download image for {post.shortcode}: {e}", file=sys.stderr)
                        image_filename = None

                results.append({
                    'username': username,
                    'city': city,
                    'post_id': post.shortcode,
                    'caption': post.caption or '',
                    'image_file': image_filename,
                    'timestamp': post.date_utc.isoformat(),
                })
                page_posts += 1

            print(f"[{i+1}/{len(pages)}] @{username}: {page_posts} posts", file=sys.stderr)

        except instaloader.exceptions.ProfileNotExistsException:
            errors.append(f"{username}: profile not found")
            print(f"[{i+1}/{len(pages)}] @{username}: NOT FOUND", file=sys.stderr)
        except instaloader.exceptions.ConnectionException as e:
            errors.append(f"{username}: connection error - {e}")
            print(f"[{i+1}/{len(pages)}] @{username}: CONNECTION ERROR", file=sys.stderr)
            if '429' in str(e) or 'rate' in str(e).lower():
                print("Rate limited. Waiting 60s...", file=sys.stderr)
                time.sleep(60)
        except Exception as e:
            errors.append(f"{username}: {e}")
            print(f"[{i+1}/{len(pages)}] @{username}: ERROR - {e}", file=sys.stderr)

        # Random delay between pages (2-5 seconds)
        if i < len(pages) - 1:
            time.sleep(random.uniform(2, 5))

    output = {
        'posts': results,
        'errors': errors,
        'fetched_at': datetime.now(timezone.utc).isoformat(),
    }
    json.dump(output, sys.stdout, indent=2)


if __name__ == '__main__':
    main()
