import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'

interface UploadResult {
  success: boolean
  location?: string
  error?: string
}

// API 반환 타입 정의
interface S3UploadResult {
  success: boolean
  location?: string
  error?: string
}

function S3Upload(): JSX.Element {
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string>('')
  const [keyPrefix, setKeyPrefix] = useState<string>('')
  const [uploading, setUploading] = useState<boolean>(false)
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null)
  const [bucket, setBucket] = useState<string>('')

  // Load bucket info when component mounts
  useEffect(() => {
    loadBucketFromSettings()
  }, [])

  // Load bucket info from saved settings
  const loadBucketFromSettings = async () => {
    try {
      // @ts-ignore - Ignore type error since api property doesn't exist on Window type
      const settings = await window.api.loadSettings()
      if (settings) {
        if (typeof settings === 'string') {
          const parsedSettings = JSON.parse(settings)
          if (parsedSettings.s3Bucket && typeof parsedSettings.s3Bucket === 'string') {
            setBucket(parsedSettings.s3Bucket)
          }
        } else if (settings.s3Bucket && typeof settings.s3Bucket === 'string') {
          setBucket(settings.s3Bucket)
        }
      }
    } catch (error) {
      console.error('Error loading bucket information:', error)
    }
  }

  // Open file selection dialog
  const handleFileSelect = async () => {
    try {
      // @ts-ignore - Ignore type error since api property doesn't exist on Window type
      const filePaths = await window.api.selectFile({
        properties: ['openFile'],
        filters: [
          { name: 'All Files', extensions: ['*'] }
        ]
      })

      if (filePaths && filePaths.length > 0) {
        const filePath = filePaths[0]
        setSelectedFile(filePath)

        // Extract file name
        const fileNameParts = filePath.split(/[\/\\]/)
        const newFileName = fileNameParts[fileNameParts.length - 1]
        setFileName(newFileName)
      }
    } catch (error) {
      console.error('Error selecting file:', error)
    }
  }

  // Perform S3 upload
  const handleUpload = async () => {
    if (!selectedFile || !bucket) {
      setUploadResult({
        success: false,
        error: 'File and bucket must be selected. Set the bucket in settings.'
      })
      return
    }

    setUploading(true)
    setUploadResult(null)

    try {
      const key = keyPrefix
        ? `${keyPrefix.replace(/^\/+|\/+$/g, '')}/${fileName}`
        : fileName

      // @ts-ignore - Ignore type error since api property doesn't exist on Window type
      const result: S3UploadResult = await window.api.uploadFileToS3(selectedFile, bucket, key)

      setUploadResult({
        success: result.success,
        location: result.location,
        error: result.error
      })
    } catch (error: any) {
      setUploadResult({
        success: false,
        error: error.message || 'Error occurred during upload.'
      })
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="p-4 h-full flex flex-col">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h1 className="text-xl font-bold">S3 File Upload</h1>
          <p className="text-muted-foreground mt-0.5 text-xs">Upload files to AWS S3</p>
        </div>
      </div>

      <Card className="w-full flex-1">
        <CardHeader>
          <CardTitle className="text-lg">File Upload</CardTitle>
          <CardDescription className="text-xs">
            Select a file and upload it to S3.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="selectedFile" className="text-xs">Selected File</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="selectedFile"
                  value={selectedFile || ''}
                  readOnly
                  className="h-8 text-xs flex-1"
                  placeholder="Select a file"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleFileSelect}
                  className="h-8"
                >
                  Browse
                </Button>
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="bucket" className="text-xs">S3 Bucket</Label>
              <Input
                id="bucket"
                value={bucket}
                onChange={(e) => setBucket(e.target.value)}
                className="h-8 text-xs"
                placeholder="S3 bucket name"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="keyPrefix" className="text-xs">Key Prefix (folder path)</Label>
              <Input
                id="keyPrefix"
                value={keyPrefix}
                onChange={(e) => setKeyPrefix(e.target.value)}
                className="h-8 text-xs"
                placeholder="e.g., uploads/images"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="fileName" className="text-xs">File Name</Label>
              <Input
                id="fileName"
                value={fileName}
                onChange={(e) => setFileName(e.target.value)}
                className="h-8 text-xs"
                placeholder="File name for upload"
              />
            </div>
          </div>

          {uploadResult && (
            <div className={`mt-4 p-3 rounded-md text-xs ${
              uploadResult.success
                ? 'bg-green-50 border border-green-200 text-green-600'
                : 'bg-red-50 border border-red-200 text-red-600'
            }`}>
              {uploadResult.success ? (
                <div>
                  <p className="font-medium">Upload Successful!</p>
                  <p className="mt-1">File URL: {uploadResult.location}</p>
                </div>
              ) : (
                <div>
                  <p className="font-medium">Upload Failed</p>
                  <p className="mt-1">Error: {uploadResult.error}</p>
                </div>
              )}
            </div>
          )}
        </CardContent>
        <CardFooter className="flex justify-end">
          <Button
            size="sm"
            onClick={handleUpload}
            disabled={!selectedFile || uploading}
          >
            {uploading ? 'Uploading...' : 'Upload to S3'}
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}

export default S3Upload
