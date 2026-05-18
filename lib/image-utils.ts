// ============================================
// Image Utility Functions
// ============================================

export interface ImageValidationResult {
  valid: boolean
  error?: string
}

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

/**
 * Validate an image file
 */
export function validateImage(file: File): ImageValidationResult {
  if (!ALLOWED_TYPES.includes(file.type)) {
    return {
      valid: false,
      error: 'Invalid file type. Please use JPEG, PNG, WebP, or GIF.',
    }
  }

  if (file.size > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: 'File too large. Maximum size is 10MB.',
    }
  }

  return { valid: true }
}

/**
 * Convert File to base64 string
 */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.readAsDataURL(file)
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = (error) => reject(error)
  })
}

/**
 * Create a thumbnail URL from a File
 */
export function createThumbnailUrl(file: File): string {
  return URL.createObjectURL(file)
}

/**
 * Revoke a thumbnail URL to free memory
 */
export function revokeThumbnailUrl(url: string): void {
  URL.revokeObjectURL(url)
}

/**
 * Compress an image to a maximum width
 */
export async function compressImage(
  file: File,
  maxWidth: number = 1024,
  quality: number = 0.8
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')

    img.onload = () => {
      let { width, height } = img

      // Calculate new dimensions
      if (width > maxWidth) {
        height = (height * maxWidth) / width
        width = maxWidth
      }

      canvas.width = width
      canvas.height = height

      if (!ctx) {
        reject(new Error('Could not get canvas context'))
        return
      }

      ctx.drawImage(img, 0, 0, width, height)

      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob)
          } else {
            reject(new Error('Could not create blob'))
          }
        },
        'image/jpeg',
        quality
      )
    }

    img.onerror = () => reject(new Error('Could not load image'))
    img.src = URL.createObjectURL(file)
  })
}

/**
 * Generate a unique ID for uploads
 */
export function generateUploadId(): string {
  return `upload-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

/**
 * Upload a local image file to Supabase storage
 * @param file - The file to upload
 * @param permanent - If true, saves to 'hub' folder (Skinny Hub), otherwise 'temp'
 * @returns The public HTTP URL of the uploaded image
 */
export async function uploadLocalImage(
  file: File,
  permanent: boolean = false
): Promise<string> {
  // Get Whop user ID from localStorage (for dev) or it will be handled server-side
  let whopUserId = 'anonymous'
  if (typeof window !== 'undefined') {
    const devUserId = localStorage.getItem('whop-dev-user-id')
    if (devUserId) whopUserId = devUserId
  }

  // Convert file to base64
  const base64DataUrl = await fileToBase64(file)
  const base64Data = base64DataUrl.split(',')[1]

  // Determine file extension
  const ext = file.type.includes('png') ? 'png' : file.type.includes('jpeg') || file.type.includes('jpg') ? 'jpg' : 'webp'
  const filename = `${generateUploadId()}.${ext}`
  const folder = permanent ? 'hub' : 'temp'

  // Upload via API route (handles auth and Supabase service role)
  const response = await fetch('/api/upload-image', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(typeof window !== 'undefined' && localStorage.getItem('whop-dev-token')
        ? { 'x-whop-user-token': localStorage.getItem('whop-dev-token')! }
        : {}),
      ...(typeof window !== 'undefined' && localStorage.getItem('whop-dev-user-id')
        ? { 'x-whop-user-id': localStorage.getItem('whop-dev-user-id')! }
        : {}),
    },
    body: JSON.stringify({
      base64: base64Data,
      mimeType: file.type,
      filename,
      folder,
    }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Upload failed' }))
    throw new Error(error.error || 'Failed to upload image')
  }

  const data = await response.json()
  return data.url
}

/**
 * Get image dimensions from a File
 */
export function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()

    img.onload = () => {
      resolve({ width: img.width, height: img.height })
      URL.revokeObjectURL(img.src)
    }

    img.onerror = () => {
      reject(new Error('Could not load image'))
      URL.revokeObjectURL(img.src)
    }

    img.src = URL.createObjectURL(file)
  })
}
