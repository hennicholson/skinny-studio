const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = 'https://bkbcoxyumovpqiqfcxoa.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrYmNveHl1bW92cHFpcWZjeG9hIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NjUyMTIwMiwiZXhwIjoyMDcyMDk3MjAyfQ.YEgmQVN54dlgJCMomOgKRTOn49baOCdOuQVjI0S24OQ';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const GALLERY_DIR = path.join(__dirname, '..', 'gallery-images');
const BUCKET_NAME = 'gallery';

async function uploadImages() {
  console.log('Starting gallery image upload...');
  console.log('Reading images from:', GALLERY_DIR);

  const files = fs.readdirSync(GALLERY_DIR).filter(f =>
    f.endsWith('.jpeg') || f.endsWith('.jpg') || f.endsWith('.png') || f.endsWith('.webp')
  );

  console.log(`Found ${files.length} images to upload`);

  let uploaded = 0;
  let failed = 0;

  for (const file of files) {
    const filePath = path.join(GALLERY_DIR, file);
    const fileBuffer = fs.readFileSync(filePath);

    // Clean filename - replace spaces and special chars
    const cleanName = file.replace(/\s+/g, '_').replace(/[()]/g, '');
    const storagePath = `creator-gallery/${cleanName}`;

    try {
      const { data, error } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(storagePath, fileBuffer, {
          contentType: 'image/jpeg',
          upsert: true
        });

      if (error) {
        console.error(`Failed to upload ${file}:`, error.message);
        failed++;
      } else {
        uploaded++;
        console.log(`[${uploaded}/${files.length}] Uploaded: ${cleanName}`);
      }
    } catch (err) {
      console.error(`Error uploading ${file}:`, err.message);
      failed++;
    }
  }

  console.log('\n--- Upload Complete ---');
  console.log(`Uploaded: ${uploaded}`);
  console.log(`Failed: ${failed}`);

  // Get public URLs for all uploaded images
  console.log('\n--- Gallery Image URLs ---');
  const { data: listData, error: listError } = await supabase.storage
    .from(BUCKET_NAME)
    .list('creator-gallery');

  if (listData) {
    console.log(`\nTotal images in gallery: ${listData.length}`);
    console.log('\nFirst 5 public URLs:');
    listData.slice(0, 5).forEach(file => {
      const url = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET_NAME}/creator-gallery/${file.name}`;
      console.log(url);
    });
  }
}

uploadImages().catch(console.error);
