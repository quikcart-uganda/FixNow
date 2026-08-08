import type { IAdminUser } from '../models/admin/Admin.js';
import type { ICustomerProfile } from '../models/customer/Customer.js';
import type { ITechnicianProfile } from '../models/technician/Technician.js';
import type { IUser } from '../models/auth/User.js';
import { AdminUser, CustomerProfile, TechnicianProfile, User } from '../models/index.js';
import { BaseRepository } from './BaseRepository.js';

export class UserRepository extends BaseRepository<IUser> {
  constructor() {
    super(User);
  }
}

export class CustomerProfileRepository extends BaseRepository<ICustomerProfile> {
  constructor() {
    super(CustomerProfile);
  }
}

export class TechnicianProfileRepository extends BaseRepository<ITechnicianProfile> {
  constructor() {
    super(TechnicianProfile);
  }
}

export class AdminProfileRepository extends BaseRepository<IAdminUser> {
  constructor() {
    super(AdminUser);
  }
}

export const userRepository = new UserRepository();
export const customerProfileRepository = new CustomerProfileRepository();
export const technicianProfileRepository = new TechnicianProfileRepository();
export const adminProfileRepository = new AdminProfileRepository();
