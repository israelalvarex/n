import { Module } from '@nestjs/common';
import { AWSService } from './aws.service';
import { AWSController } from './aws.controller';

@Module({
  controllers: [AWSController],
  providers: [AWSService],
  exports: [AWSService],
})
export class AwsModule {}
