export * from './user.entity';
export * from './exam.entity';
export * from './candidate.entity';
export * from './check-log.entity';
export * from './photo.entity';
export * from './message.entity';
export * from './row-assignment.entity';

import { User } from './user.entity';
import { Exam } from './exam.entity';
import { Candidate } from './candidate.entity';
import { CheckLog } from './check-log.entity';
import { Photo } from './photo.entity';
import { Message } from './message.entity';
import { RowAssignment } from './row-assignment.entity';

export const ENTITIES = [User, Exam, Candidate, CheckLog, Photo, Message, RowAssignment];
