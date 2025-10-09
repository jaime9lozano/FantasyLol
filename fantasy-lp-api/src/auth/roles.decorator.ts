import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';
export type RoleValue = 'admin' | 'manager' | 'dev';
export const Roles = (...roles: RoleValue[]) => SetMetadata(ROLES_KEY, roles);
