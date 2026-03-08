#include <eosio/eosio.hpp>
#include <eosio/privileged.hpp>
using namespace eosio;

class [[eosio::contract("setprods")]] setprods_contract : public contract {
public:
   using contract::contract;

   [[eosio::action]]
   void setprods(const std::vector<eosio::producer_key>& schedule) {
      require_auth(get_self());
      eosio::set_proposed_producers(schedule);
   }
};
