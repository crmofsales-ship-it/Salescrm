import axios from 'axios';

const API_URL = 'http://localhost:5000/api/auth';

export const addMember = async (memberData) => {
  const token = localStorage.getItem('token'); // JWT token login se
  try {
    const response = await axios.post(`${API_URL}/add-member`, memberData, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  } catch (error) {
    throw error.response?.data?.error || "Server Error";
  }
};