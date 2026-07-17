declare module '@aws-sdk/client-s3' {
  export class S3Client {
    constructor(config: any);
    send(command: any): Promise<any>;
  }

  export class PutObjectCommand {
    constructor(input: any);
  }
}
