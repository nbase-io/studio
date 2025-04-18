
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Version } from '@/lib/api';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface VersionFormProps {
  version: Partial<Version>;
  formErrors: Record<string, string>;
  onVersionChange: (updatedVersion: Partial<Version>) => void;
  isEdit?: boolean;
}

export default function VersionForm({
  version,
  formErrors,
  onVersionChange,
  isEdit = false
}: VersionFormProps) {
  return (
    <div className="grid gap-4">
      {/* Code, Name, Status 한 줄로 표시 */}
      <div className="grid grid-cols-3 gap-4">
        <div>
          <Label htmlFor={`${isEdit ? "edit-" : ""}versionCode`} className="text-xs mb-1 block">
            Code
          </Label>
          <Input
            id={`${isEdit ? "edit-" : ""}versionCode`}
            placeholder="1.0.1"
            className="text-xs h-8 w-full"
            value={version.versionCode || ''}
            onChange={(e) => onVersionChange({ ...version, versionCode: e.target.value })}
          />
          {formErrors.versionCode && (
            <div className="text-xs text-red-500 mt-1">
              {formErrors.versionCode}
            </div>
          )}
        </div>

        <div>
          <Label htmlFor={`${isEdit ? "edit-" : ""}versionName`} className="text-xs mb-1 block">
            Name
          </Label>
          <Input
            id={`${isEdit ? "edit-" : ""}versionName`}
            placeholder="First Release"
            className="text-xs h-8 w-full"
            value={version.versionName || ''}
            onChange={(e) => onVersionChange({ ...version, versionName: e.target.value })}
          />
          {formErrors.versionName && (
            <div className="text-xs text-red-500 mt-1">
              {formErrors.versionName}
            </div>
          )}
        </div>

        <div>
          <Label htmlFor={`${isEdit ? "edit-" : ""}status`} className="text-xs mb-1 block">
            Status
          </Label>
          <Select
            value={version.status}
            onValueChange={(value) => onVersionChange({ ...version, status: value as any })}
          >
            <SelectTrigger className="text-xs h-8 w-full">
              <SelectValue placeholder="Select status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="development" className="text-xs">Development</SelectItem>
              <SelectItem value="draft" className="text-xs">Draft</SelectItem>
              <SelectItem value="published" className="text-xs">Published</SelectItem>
              <SelectItem value="archived" className="text-xs">Archived</SelectItem>
            </SelectContent>
          </Select>
          {formErrors.status && (
            <div className="text-xs text-red-500 mt-1">
              {formErrors.status}
            </div>
          )}
        </div>
      </div>

      {/* ChangeLog */}
      <div>
        <Textarea
          id={`${isEdit ? "edit-" : ""}changeLog`}
          placeholder="Version ChangeLog"
          className={`${isEdit ? "h-20" : "col-span-4 h-20"} text-xs w-full`}
          value={version.changeLog || ''}
          onChange={(e) => onVersionChange({ ...version, changeLog: e.target.value })}
        />
        {formErrors.changeLog && (
          <div className="text-xs text-red-500 mt-1">
            {formErrors.changeLog}
          </div>
        )}
      </div>
    </div>
  );
}
