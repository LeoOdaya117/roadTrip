import axiosInstance from "./axiosInstance";

const userApi = {
  login: (credentials: any) => axiosInstance.post('site/login', credentials),
  logout: () => axiosInstance.post('site/logout'),
  getProfile: () => axiosInstance.get('/user/profile'),

  getUser: async (userId: string) => {
    const response = await axiosInstance.get(`/users/${userId}`);
    return response.data;
  },

  createUser: async (userData: any) => {
    const response = await axiosInstance.post("/users", userData);
    return response.data;
  },

  updateUser: async (userId: string, userData: any) => {
    const response = await axiosInstance.put(`/users/${userId}`, userData);
    return response.data;
  },

  deleteUser: async (userId: string) => {
    const response = await axiosInstance.delete(`/users/${userId}`);
    return response.data;
  },
};

export default userApi;