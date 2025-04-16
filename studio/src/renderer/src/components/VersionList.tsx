import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Version } from '@/lib/api';
import { Edit, Trash, Download } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Pagination, PaginationContent, PaginationItem, PaginationNext, PaginationPrevious } from '@/components/ui/pagination';

interface VersionListProps {
  versions: Version[];
  totalCount: number;
  page: number;
  limit: number;
  onEdit: (version: Version) => void;
  onDelete: (version: Version) => void;
  onPageChange: (page: number) => void;
}

export default function VersionList({
  versions,
  totalCount,
  page,
  limit,
  onEdit,
  onDelete,
  onPageChange
}: VersionListProps) {
  return (
    <div>
      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow className="h-8">
              <TableHead className="w-[80px] text-[9px] py-1 px-2">Status</TableHead>
              <TableHead className="w-[120px] text-[9px] py-1 px-2">Version</TableHead>
              <TableHead className="text-[9px] py-1 px-2">Description</TableHead>
              <TableHead className="w-[100px] text-[9px] py-1 px-2">Files</TableHead>
              <TableHead className="w-[120px] text-[9px] py-1 px-2">Created</TableHead>
              <TableHead className="w-[150px] text-right text-[9px] py-1 px-2">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {versions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center h-24 text-[9px] text-gray-500">
                  No versions available
                </TableCell>
              </TableRow>
            ) : (
              versions.map((version) => (
                <TableRow key={version.id} className="h-8">
                  <TableCell className="py-1 px-2">
                    <Badge
                      variant={version.status === 'published' ? 'default' :
                             version.status === 'draft' ? 'secondary' :
                             version.status === 'archived' ? 'outline' : 'destructive'}
                      className="px-2 text-[8px]"
                    >
                      {version.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-medium text-[9px] py-1 px-2">{version.versionCode}</TableCell>
                  <TableCell className="text-[9px] truncate max-w-[300px] py-1 px-2">
                    {version.changeLog || '-'}
                  </TableCell>
                  <TableCell className="text-[9px] py-1 px-2">
                    {version.files?.length || 0} files
                  </TableCell>
                  <TableCell className="text-[8px] py-1 px-2">
                    {version.createdAt ? new Date(version.createdAt).toLocaleDateString() : '-'}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5"
                        onClick={() => onEdit(version)}
                      >
                        <Edit className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5 text-red-500 hover:text-red-600 hover:bg-red-50"
                        onClick={() => onDelete(version)}
                      >
                        <Trash className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5 text-blue-500 hover:text-blue-600 hover:bg-blue-50"
                        disabled={!version.download_url}
                        onClick={() => {
                          if (version.download_url) {
                            window.open(version.download_url, '_blank')
                          }
                        }}
                      >
                        <Download className="h-3 w-3" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* 페이지네이션 */}
      {totalCount > limit && (
        <div className="flex justify-end mt-4">
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  onClick={() => onPageChange(Math.max(1, page - 1))}
                  className={page === 1 ? "cursor-not-allowed opacity-50" : ""}
                />
              </PaginationItem>
              <PaginationItem>
                <span className="text-xs">
                  {page} / {Math.ceil(totalCount / limit)}
                </span>
              </PaginationItem>
              <PaginationItem>
                <PaginationNext
                  onClick={() => onPageChange(Math.min(Math.ceil(totalCount / limit), page + 1))}
                  className={page === Math.ceil(totalCount / limit) ? "cursor-not-allowed opacity-50" : ""}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      )}
    </div>
  );
}
