import { Injectable, InternalServerErrorException } from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';
import { extname } from 'path';

const PRESIGNED_TTL_SECONDS = 15 * 60; // 15 minutes

@Injectable()
export class UploadService {
  private readonly s3 = new S3Client({
    endpoint: this.normalizeEndpoint(process.env.S3_ENDPOINT!),
    region: process.env.S3_REGION ?? 'eu-central-1',
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY!,
      secretAccessKey: process.env.S3_SECRET_KEY!,
    },
    forcePathStyle: true,
  });

  private normalizeEndpoint(url: string): string {
    if (!url) return url;
    return url.startsWith('http') ? url : `https://${url}`;
  }

  private readonly bucket = process.env.S3_BUCKET!;

  async upload(file: Express.Multer.File, folder: string): Promise<string> {
    const ext = extname(file.originalname);
    const key = `${folder}/${randomUUID()}${ext}`;

    try {
      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: file.buffer,
          ContentType: file.mimetype,
        }),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new InternalServerErrorException(`S3 upload failed: ${message}`);
    }

    // Store the S3 key as the fileUrl (not a public URL)
    return key;
  }

  async deleteFile(key: string): Promise<void> {
    try {
      await this.s3.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new InternalServerErrorException(`S3 delete failed: ${message}`);
    }
  }

  async getPresignedUrl(key: string): Promise<string> {
    try {
      return await getSignedUrl(
        this.s3,
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
        { expiresIn: PRESIGNED_TTL_SECONDS },
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new InternalServerErrorException(
        `Failed to generate presigned URL: ${message}`,
      );
    }
  }
}
