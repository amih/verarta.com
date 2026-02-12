cmake_minimum_required(VERSION 3.5)
project(verarta_core VERSION 1.0.0)

set(EOSIO_WASM_OLD_BEHAVIOR "Off")

find_package(cdt REQUIRED)

add_contract(verarta.core verarta.core verarta.core.cpp)

target_include_directories(verarta.core PUBLIC ${CMAKE_CURRENT_SOURCE_DIR})

set_target_properties(verarta.core
   PROPERTIES
   RUNTIME_OUTPUT_DIRECTORY "${CMAKE_CURRENT_BINARY_DIR}"
)

# Generate ABI
add_custom_command(TARGET verarta.core POST_BUILD
   COMMAND ${CDT_ABIGEN}
   "${CMAKE_CURRENT_SOURCE_DIR}/verarta.core.cpp"
   --contract=verarta.core
   --output="${CMAKE_CURRENT_BINARY_DIR}/verarta.core.abi"
)
