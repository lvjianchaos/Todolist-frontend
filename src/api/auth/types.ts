export interface LoginRequestDto {
  username: string
  password: string
}

export interface LoginResponseDto {
  userId: string
  username: string
  nickname: string
  avatar: string | null
  token: string
}

export interface RegisterRequestDto {
  username: string
  password: string
  nickname: string
}
