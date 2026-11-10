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
import urllib.parse
from datetime import datetime, timedelta, timezone
from pathlib import Path

import instaloader


def main():
    parser = argparse.ArgumentParser(description='Scrape Instagram quiz pages')
    parser.add_argument('--days', type=int, default=7, help='Fetch posts from last N days')
    parser.add_argument('--login', type=str, default=None, help='Instagram username for session')
    parser.add_argument('--pages', type=str, default=None, help='Path to pages.json')
    parser.add_argument('--offset', type=int, default=0, help='Start from this page index (wraps around)')
    parser.add_argument('--no-download', action='store_true', help='Report image URLs instead of downloading them')
    args = parser.parse_args()

    script_dir = Path(__file__).parent
    pages_path = Path(args.pages) if args.pages else script_dir / 'pages.json'
    posters_dir = script_dir.parent.parent / 'data' / 'posters'
    posters_dir.mkdir(parents=True, exist_ok=True)

    with open(pages_path) as f:
        pages = json.load(f)

    L = instaloader.Instaloader(
        max_connection_attempts=1,
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
    pages_done = 0
    blocked = False
    consecutive_failures = 0

    # Start at --offset and wrap, so a run cut short by rate limiting resumes
    # where it stopped instead of always starving the same pages.
    offset = args.offset % len(pages) if pages else 0
    pages = pages[offset:] + pages[:offset]

    for i, page in enumerate(pages):
        username = page['username']
        city = page.get('city', None)

        try:
            profile = instaloader.Profile.from_username(L.context, username)
            page_posts = 0
            old_seen = 0

            for post in profile.get_posts():
                post_date = post.date_utc
                if post_date.tzinfo is None:
                    post_date = post_date.replace(tzinfo=timezone.utc)
                if post_date < cutoff:
                    # Up to 3 pinned posts come first regardless of age, so one
                    # old post does not mean the rest are old too.
                    old_seen += 1
                    if old_seen > 3:
                        break
                    continue

                # Download image
                image_filename = None
                if post.url and not args.no_download:
                    parsed = urllib.parse.urlparse(post.url)
                    if parsed.scheme not in ('http', 'https') or not parsed.netloc:
                        print(f"  Skipping invalid image URL for {post.shortcode}: {post.url}", file=sys.stderr)
                    else:
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
                    'image_url': post.url or None,
                    'timestamp': post.date_utc.isoformat(),
                })
                page_posts += 1

            print(f"[{i+1}/{len(pages)}] @{username}: {page_posts} posts", file=sys.stderr)
            pages_done += 1
            consecutive_failures = 0

        except instaloader.exceptions.ProfileNotExistsException:
            errors.append(f"{username}: profile not found")
            pages_done += 1
            print(f"[{i+1}/{len(pages)}] @{username}: NOT FOUND", file=sys.stderr)
        except instaloader.exceptions.ConnectionException as e:
            errors.append(f"{username}: connection error - {e}")
            print(f"[{i+1}/{len(pages)}] @{username}: CONNECTION ERROR", file=sys.stderr)
            consecutive_failures += 1
            if consecutive_failures >= 3:
                print("3 pages in a row refused: Instagram is blocking us, stopping this run.", file=sys.stderr)
                blocked = True
                break
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
        'pages_total': len(pages),
        'pages_done': pages_done,
        'blocked': blocked,
        'next_offset': (offset + i - 2) % len(pages) if blocked else 0,
        'fetched_at': datetime.now(timezone.utc).isoformat(),
    }
    json.dump(output, sys.stdout, indent=2)


if __name__ == '__main__':
    main()
