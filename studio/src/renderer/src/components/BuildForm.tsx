import { useState } from 'react'
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Build } from '@/lib/api'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

// BuildForm 인터페이스
export interface BuildFormProps {
  loading?: boolean;
  error?: string;
  onSubmit: (formData: Build) => void;
  onCancel?: () => void;
  initialData?: Partial<Build>;
  submitLabel?: string;
}

export default function BuildForm({
  loading = false,
  error = '',
  onSubmit,
  onCancel,
  initialData = {},
  submitLabel = 'Submit'
}: BuildFormProps) {
  const [formData, setFormData] = useState<Build>({
    name: initialData.name || '',
    version: initialData.version || '',
    description: initialData.description || '',
    status: initialData.status || 'draft',
    size: initialData.size || 0,
    download_url: initialData.download_url || '',
    build_number: initialData.build_number || 1,
    platform: initialData.platform || 'android',
    build_path: initialData.build_path || ''
  });

  // Input 값 변경 핸들러
  const handleInputChange = (key: keyof Build, value: any) => {
    setFormData(prev => ({
      ...prev,
      [key]: value
    }));
  };

  // 폼 제출 핸들러
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  if (loading) {
    return (
      <Card className="w-full max-w-md mx-auto">
        <CardContent className="pt-6">
          <div className="flex items-center justify-center h-40">
            <p className="text-sm text-muted-foreground">Loading...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <Card className="w-full max-w-md mx-auto">
        <CardHeader>
          <CardTitle className="text-xl">Build Form</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 text-xs">
            <div className="space-y-1">
              <Label htmlFor="name" className="text-xs">Build Name</Label>
              <Input
                id="name"
                placeholder="Build name"
                value={formData.name}
                onChange={(e) => handleInputChange('name', e.target.value)}
                className="h-7 text-xs"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="version" className="text-xs">Version</Label>
              <Input
                id="version"
                placeholder="Build version"
                value={formData.version}
                onChange={(e) => handleInputChange('version', e.target.value)}
                className="h-7 text-xs"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="description" className="text-xs">Description</Label>
              <Textarea
                id="description"
                placeholder="Build description"
                value={formData.description}
                onChange={(e) => handleInputChange('description', e.target.value)}
                className="text-xs min-h-20"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="status" className="text-xs">Status</Label>
              <Select
                onValueChange={(value) => handleInputChange('status', value)}
                value={formData.status || 'draft'}
              >
                <SelectTrigger className="text-xs h-7">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent className="text-xs">
                  <SelectItem value="draft" className="text-xs">Draft</SelectItem>
                  <SelectItem value="published" className="text-xs">Published</SelectItem>
                  <SelectItem value="archived" className="text-xs">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="platform" className="text-xs">Platform</Label>
              <Select
                onValueChange={(value) => handleInputChange('platform', value)}
                value={formData.platform || ''}
              >
                <SelectTrigger className="text-xs h-7">
                  <SelectValue placeholder="Select platform" />
                </SelectTrigger>
                <SelectContent className="text-xs">
                  <SelectItem value="windows">Windows</SelectItem>
                  <SelectItem value="mac">macOS</SelectItem>
                  <SelectItem value="web">Web</SelectItem>
                  <SelectItem value="android">Android</SelectItem>
                  <SelectItem value="ios">iOS</SelectItem>
                  <SelectItem value="xbox">Xbox</SelectItem>
                  <SelectItem value="playstation4">PlayStation 4</SelectItem>
                  <SelectItem value="playstation5">PlayStation 5</SelectItem>
                  <SelectItem value="steam">Steam</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex justify-end space-x-2">
          {onCancel && (
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              className="h-7 text-xs"
              disabled={loading}
            >
              Cancel
            </Button>
          )}
          <Button
            type="submit"
            className="h-7 text-xs"
            disabled={loading}
          >
            {loading ? 'Submitting...' : submitLabel}
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
