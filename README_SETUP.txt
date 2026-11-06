MangaMunchies — Owner Dashboard update
======================================

This ZIP keeps the current public MangaMunchies layout, public upload flow, and Owner Dashboard.
It also groups manga with the same title into one folder; each uploaded volume/chapter
appears inside that folder and can be opened in the reader. Visitors can browse and upload
without creating an account. Owner sign-in is separate.

WHAT'S NEW
- Owner sign-in with the existing Supabase Auth email/password account.
- Owner access is checked against the existing public.site_admins table.
- Owner can delete individual public manga uploads.
- Public library groups uploads by Manga title into folders. Open a folder to see its
  chapters, then choose a chapter to read its uploaded image.
- Owner can choose a site-wide theme: Midnight Plum, Sakura Pink, Ocean Blue,
  Forest Green, Sunset Orange, or Monochrome.
- Theme choice is stored in public.site_settings and is shared with all visitors.

IMPORTANT BEFORE DEPLOYING
1. Keep a backup of your current Netlify deploy files.
2. Open Supabase SQL Editor and run supabase/public_manga_setup.sql.
   It creates the site_settings table and adds owner-only delete/settings policies.
   It does not drop your existing manga records or storage bucket.
3. Confirm the owner account is already present in public.site_admins (site_admins.user_id).
   The existing owner UID supplied earlier was confirmed inserted; do not insert a duplicate.
4. Upload the extracted ZIP contents (index.html and assets folder) to the existing Netlify site.
   Keep the supabase folder for your SQL reference. The existing manga records are not changed;
   their title and volume values are used to build folders and chapter entries.
5. Open the site, go to Owner, and sign in using the owner email/password.

SECURITY
- The browser uses only the Supabase publishable key. Never add a service_role or secret key.
- Public manga upload is intentionally open, as requested. Anyone can upload allowed image
  types up to 8 MB. Public uploads can be abused; monitor the library and delete spam as owner.
- Owner-only operations are protected by Supabase Row Level Security policies and the
  existing site_admins table, not just by hiding buttons in the page.
- This update does not change or reset your Supabase Auth password.

THEME SAVE ERROR FIX
====================
If the Owner Dashboard shows "Could not find the table public.site_settings in the schema cache",
open Supabase Dashboard -> SQL Editor -> New query, paste/run the contents of
supabase/fix_site_theme.sql, then refresh the website. This creates the missing settings table
and owner-only policies; it does not delete manga uploads or change login credentials.


BULK CHAPTER UPLOAD + VIEWS + COMMENTS
======================================
- Upload form now accepts up to 50 image files in one selection. Each image is saved as one chapter; the image filename becomes the chapter label. Each image must be JPG/PNG/WEBP/GIF and <= 8 MB. This is a batch of chapter image files, not a ZIP/CBZ/PDF importer.
- Each manga folder counts one view per browser tab session when opened. Counts are stored in manga_view_counts.
- Visitors can post comments using a display name; comments are stored per manga title. Owner dashboard can review recent comments and delete them.

REQUIRED DATABASE STEP
1. In Supabase Dashboard -> SQL Editor, run supabase/community_features.sql.
2. Deploy the extracted ZIP contents to the existing Netlify site, replacing the website files while keeping the existing assets folder.
3. Refresh the site. Test with one or two sample image files before bulk uploading.

The SQL creates only new community tables/function and policies. Existing manga rows, themes, owner login and storage files are not deleted. Public comments are open to visitors by name (no login); consider moderation because public posting can attract spam.
