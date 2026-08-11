import type { User as PrismaUser } from '@prisma/client';

import { User } from '../../../domain/entities/user';
import { Email } from '../../../domain/value-objects/email';

export const UserMapper = {
  toDomain(row: PrismaUser): User {
    return User.restore({
      id: row.id,
      name: row.name,
      email: Email.create(row.email),
      passwordHash: row.passwordHash,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  },

  toPersistence(user: User): PrismaUser {
    return {
      id: user.id,
      name: user.name,
      // `.value` e não o objeto: o banco guarda a forma canônica já normalizada
      // pelo value object, que é o que faz o índice UNIQUE funcionar de verdade.
      email: user.email.value,
      passwordHash: user.passwordHash,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  },
};
